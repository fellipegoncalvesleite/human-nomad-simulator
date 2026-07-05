import type { Band, IntraSeasonTripTaskGroupType, ResidentialMoveEvent } from "./types";
import type { BandId, EventId, ReasonId, RouteId, TileId } from "../core/types";
import type { WorldState } from "../world/types";
import { deriveCanonicalEvents, type CanonicalEvent } from "./eventSystem";

const IDENTITY_CARD_CAP = 8;
const EVIDENCE_PER_CARD_CAP = 4;
const LINK_PER_CARD_CAP = 4;
const SUMMARY_LINE_CAP = 3;
const SOURCE_SAMPLE_CAP = 10;

export type BandIdentityDimension =
  | "subsistence"
  | "familiar_country"
  | "mobility_style"
  | "risk_memory"
  | "social_demographic"
  | "inheritance";

export type BandIdentityStrength =
  | "uncertain"
  | "weak"
  | "forming"
  | "established"
  | "durable"
  | "inherited";

export type BandIdentityEvidenceKind =
  | "canonical_event"
  | "deep_history"
  | "activity"
  | "place_memory"
  | "route_memory"
  | "crossing_memory"
  | "demography"
  | "residential_move"
  | "seasonal_support"
  | "relationship_memory"
  | "founding_snapshot";

export type BandIdentityEvidenceScope = "recent" | "durable" | "inherited" | "current";
export type BandIdentityLivedStatus = "personally_lived" | "inherited_not_personally_lived";

export interface BandIdentityEvidenceRef {
  readonly kind: BandIdentityEvidenceKind;
  readonly label: string;
  readonly sourceId: string;
  readonly scope: BandIdentityEvidenceScope;
  readonly livedStatus: BandIdentityLivedStatus;
  readonly confidence: number;
  readonly eventId?: string;
  readonly chronicleLinkId?: string;
  readonly tileId?: TileId;
  readonly routeId?: RouteId;
  readonly reasonIds: readonly ReasonId[];
}

export interface BandIdentityCard {
  readonly id: string;
  readonly dimension: BandIdentityDimension;
  readonly title: string;
  readonly summary: string;
  readonly strength: BandIdentityStrength;
  readonly confidence: number;
  readonly evidence: readonly BandIdentityEvidenceRef[];
  readonly uncertainty?: string;
  readonly relatedEventIds: readonly string[];
  readonly relatedChronicleLinkIds: readonly string[];
  readonly livedEvidenceCount: number;
  readonly inheritedEvidenceCount: number;
  readonly sourceKinds: readonly BandIdentityEvidenceKind[];
}

export interface BandIdentityProfile {
  readonly bandId: BandId;
  readonly generatedAtYear: number;
  readonly generatedAtTick: number;
  readonly summaryTitle: string;
  readonly summaryLines: readonly string[];
  readonly cards: readonly BandIdentityCard[];
  readonly dimensionsPresent: readonly BandIdentityDimension[];
  readonly livedEvidenceCount: number;
  readonly inheritedEvidenceCount: number;
  readonly weakSignalCount: number;
  readonly strongSignalCount: number;
  readonly eventRefCount: number;
  readonly deepHistoryRefCount: number;
  readonly activityRefCount: number;
  readonly caps: {
    readonly cardCap: number;
    readonly evidencePerCardCap: number;
    readonly linkPerCardCap: number;
    readonly summaryLineCap: number;
    readonly capsHeld: boolean;
  };
  readonly integrity: {
    readonly selectedBandOnly: true;
    readonly projectionOnly: true;
    readonly noBehaviorInfluence: true;
    readonly evidenceBacked: boolean;
    readonly ignoresLegacyStartingSkills: true;
    readonly inheritedSeparated: boolean;
  };
  readonly technicalProof: {
    readonly payloadBytesEstimate: number;
    readonly maxCardPayloadBytes: number;
    readonly evidenceKindCounts: Readonly<Record<BandIdentityEvidenceKind, number>>;
    readonly sourceIdSamples: readonly string[];
    readonly relatedEventIdSamples: readonly string[];
  };
}

type CardDraft = Omit<BandIdentityCard, "id" | "evidence" | "relatedEventIds" | "relatedChronicleLinkIds" | "livedEvidenceCount" | "inheritedEvidenceCount" | "sourceKinds"> & {
  readonly score: number;
  readonly evidence: readonly BandIdentityEvidenceRef[];
};

const DIMENSION_ORDER: readonly BandIdentityDimension[] = [
  "subsistence",
  "familiar_country",
  "mobility_style",
  "risk_memory",
  "social_demographic",
  "inheritance",
];

const EMPTY_EVIDENCE_COUNTS: Readonly<Record<BandIdentityEvidenceKind, number>> = {
  canonical_event: 0,
  deep_history: 0,
  activity: 0,
  place_memory: 0,
  route_memory: 0,
  crossing_memory: 0,
  demography: 0,
  residential_move: 0,
  seasonal_support: 0,
  relationship_memory: 0,
  founding_snapshot: 0,
};

export function deriveBandIdentityProfile(world: WorldState, band: Band): BandIdentityProfile {
  const eventState = deriveCanonicalEvents(world, band);
  const events = eventState.events;
  const drafts = [
    buildSubsistenceCard(band, events),
    buildFamiliarCountryCard(band, events),
    buildMobilityCard(band, events),
    buildRiskMemoryCard(band, events),
    buildSocialDemographicCard(band, events),
    buildInheritanceCard(band, events),
  ];
  const cards = drafts
    .sort((left, right) => dimensionOrder(left.dimension) - dimensionOrder(right.dimension))
    .slice(0, IDENTITY_CARD_CAP)
    .map((draft) => finalizeCard(band, draft));
  const summaryLines = buildSummaryLines(cards).slice(0, SUMMARY_LINE_CAP);
  const allEvidence = cards.flatMap((card) => card.evidence);
  const evidenceKindCounts = countEvidenceKinds(allEvidence);
  const payloadBytesEstimate = byteLengthUtf8(JSON.stringify({
    bandId: band.id,
    generatedAtTick: world.time.tick,
    generatedAtYear: world.time.year,
    summaryLines,
    cards,
  }));
  const cardPayloads = cards.map((card) => byteLengthUtf8(JSON.stringify(card)));

  return {
    bandId: band.id,
    generatedAtYear: world.time.year,
    generatedAtTick: Number(world.time.tick),
    summaryTitle: summaryTitle(cards),
    summaryLines,
    cards,
    dimensionsPresent: cards.map((card) => card.dimension),
    livedEvidenceCount: allEvidence.filter((entry) => entry.livedStatus === "personally_lived").length,
    inheritedEvidenceCount: allEvidence.filter((entry) => entry.livedStatus === "inherited_not_personally_lived").length,
    weakSignalCount: cards.filter((card) => card.strength === "weak" || card.strength === "uncertain").length,
    strongSignalCount: cards.filter((card) => card.strength === "established" || card.strength === "durable").length,
    eventRefCount: allEvidence.filter((entry) => entry.kind === "canonical_event").length,
    deepHistoryRefCount: allEvidence.filter((entry) => entry.kind === "deep_history" || entry.kind === "founding_snapshot").length,
    activityRefCount: allEvidence.filter((entry) => entry.kind === "activity").length,
    caps: {
      cardCap: IDENTITY_CARD_CAP,
      evidencePerCardCap: EVIDENCE_PER_CARD_CAP,
      linkPerCardCap: LINK_PER_CARD_CAP,
      summaryLineCap: SUMMARY_LINE_CAP,
      capsHeld: cards.length <= IDENTITY_CARD_CAP && cards.every((card) =>
        card.evidence.length <= EVIDENCE_PER_CARD_CAP &&
        card.relatedEventIds.length <= LINK_PER_CARD_CAP &&
        card.relatedChronicleLinkIds.length <= LINK_PER_CARD_CAP),
    },
    integrity: {
      selectedBandOnly: true,
      projectionOnly: true,
      noBehaviorInfluence: true,
      evidenceBacked: cards.every((card) => card.evidence.length > 0),
      ignoresLegacyStartingSkills: true,
      inheritedSeparated: cards.every((card) =>
        card.inheritedEvidenceCount === 0 ||
        card.evidence.some((entry) => entry.livedStatus === "inherited_not_personally_lived")),
    },
    technicalProof: {
      payloadBytesEstimate,
      maxCardPayloadBytes: Math.max(0, ...cardPayloads),
      evidenceKindCounts,
      sourceIdSamples: capStrings(allEvidence.map((entry) => entry.sourceId), SOURCE_SAMPLE_CAP),
      relatedEventIdSamples: capStrings(cards.flatMap((card) => card.relatedEventIds), SOURCE_SAMPLE_CAP),
    },
  };
}

function buildSubsistenceCard(band: Band, events: readonly CanonicalEvent[]): CardDraft {
  const evidence: BandIdentityEvidenceRef[] = [];
  const taskCounts = countActivityTasks(band);
  const returnKinds = band.activityOutcomeSummary?.returnsByResourceKind ?? [];
  const foodPressureEvents = events.filter((event) => event.family === "food_water_pressure");
  const gatheredCount = (taskCounts.plant_gathering_group ?? 0) + (taskCounts.local_foraging_group ?? 0);
  const fishingCount = taskCounts.fishing_group ?? 0;
  const huntingCount = taskCounts.hunting_group ?? 0;
  const fallbackEvents = foodPressureEvents.filter((event) => /fallback|hunger|food|seasonal/i.test(`${event.title} ${event.summary}`));

  if (gatheredCount > 0) {
    evidence.push(activityEvidence("plant gathering and local foraging", gatheredCount, band));
  }
  if (fishingCount > 0 || returnKinds.some((entry) => entry.returnedResourceKind === "fish_placeholder")) {
    evidence.push(activityEvidence("fishing or aquatic returns", Math.max(1, fishingCount), band));
  }
  if (huntingCount > 0 || returnKinds.some((entry) => entry.returnedResourceKind === "hunted_food_placeholder")) {
    evidence.push(activityEvidence("hunting in recent work", Math.max(1, huntingCount), band));
  }
  evidence.push(...fallbackEvents.slice(0, 2).map((event) => eventEvidence(event, "food pressure remembered")));
  if (band.seasonalSupport !== undefined) {
    evidence.push({
      kind: "seasonal_support",
      label: band.seasonalSupport.currentSeasonSupport.foodStress > 0.35
        ? "current food stress"
        : "current food support",
      sourceId: `seasonal-support:${String(band.id)}:${band.seasonalSupport.currentSeasonSupport.year}:${band.seasonalSupport.currentSeasonSupport.season}`,
      scope: "current",
      livedStatus: "personally_lived",
      confidence: clamp01(0.45 + band.seasonalSupport.currentSeasonSupport.foodStress * 0.3),
      reasonIds: [],
    });
  }
  if (evidence.length === 0) {
    evidence.push(demographyEvidence("current food stress", band, 0.35));
  }

  const aquaticSignal = fishingCount > 0;
  const gatheringSignal = gatheredCount > 0;
  const fallbackSignal = fallbackEvents.length > 0 || (band.seasonalSupport?.currentSeasonSupport.foodStress ?? 0) > 0.45;
  const score = clamp01(gatheredCount * 0.1 + fishingCount * 0.12 + huntingCount * 0.08 + fallbackEvents.length * 0.18 + (band.seasonalSupport?.currentSeasonSupport.foodStress ?? 0) * 0.25);
  const title = aquaticSignal
    ? "Water foods stand out"
    : gatheringSignal
      ? "Gathered food stands out"
      : fallbackSignal
        ? "Scarcity shapes the food story"
        : "Food pattern still open";
  const summary = aquaticSignal
    ? "Fishing or aquatic returns show up often enough to mark how this band eats, without turning it into a fixed label."
    : gatheringSignal
      ? "Plant gathering and local foraging are the clearest food work in the recent record."
      : fallbackSignal
        ? "The record is defined more by pressure and fallback food than by one named foodway."
        : "The record has not yet settled around one clear food habit.";

  return makeDraft("subsistence", title, summary, score, evidence, fallbackSignal && score < 0.45 ? "Food pressure is present, but it is not yet a long pattern." : undefined);
}

function buildFamiliarCountryCard(band: Band, events: readonly CanonicalEvent[]): CardDraft {
  const evidence: BandIdentityEvidenceRef[] = [];
  const knownTiles = Object.keys(band.knowledge.observedTiles).length;
  const placeRecords = Object.values(band.placeMemory);
  const returnPlaces = placeRecords.filter((place) => place.isReturnPlace || place.repeatedReturnCount > 0);
  const attachedPlaces = placeRecords.filter((place) => place.attachment >= 0.45);
  const corridorCount = Object.keys(band.travelCorridors).length + (band.compressedCorridorSummaries?.length ?? 0);
  const crossingCount = Object.keys(band.crossingMemories).length;
  const countryEvents = events.filter((event) =>
    event.family === "knowledge_memory" ||
    event.type === "durable_episode" && /country|camp|route/i.test(event.title));

  if (knownTiles > 0) {
    evidence.push({
      kind: "place_memory",
      label: countLabel(knownTiles, "known place", "known places"),
      sourceId: `known-tiles:${String(band.id)}`,
      scope: "current",
      livedStatus: "personally_lived",
      confidence: clamp01(knownTiles / 48),
      reasonIds: [],
    });
  }
  if (returnPlaces.length > 0) {
    const top = returnPlaces.slice().sort((left, right) =>
      right.repeatedReturnCount - left.repeatedReturnCount ||
      String(left.tileId).localeCompare(String(right.tileId)))[0];
    evidence.push({
      kind: "place_memory",
      label: countLabel(returnPlaces.length, "return place", "return places"),
      sourceId: `place-memory:${String(top.tileId)}`,
      scope: "recent",
      livedStatus: "personally_lived",
      confidence: top.confidence,
      tileId: top.tileId,
      reasonIds: capReasonIds(top.reasonIds),
    });
  }
  if (corridorCount > 0) {
    evidence.push({
      kind: "route_memory",
      label: countLabel(corridorCount, "remembered route", "remembered routes"),
      sourceId: `routes:${String(band.id)}`,
      scope: "recent",
      livedStatus: "personally_lived",
      confidence: clamp01(corridorCount / 8),
      reasonIds: [],
    });
  }
  if (crossingCount > 0) {
    evidence.push({
      kind: "crossing_memory",
      label: countLabel(crossingCount, "known crossing", "known crossings"),
      sourceId: `crossings:${String(band.id)}`,
      scope: "recent",
      livedStatus: "personally_lived",
      confidence: clamp01(crossingCount / 6),
      reasonIds: [],
    });
  }
  evidence.push(...countryEvents.slice(0, 2).map((event) => eventEvidence(event, "older country memory")));

  const score = clamp01(knownTiles / 42 + returnPlaces.length * 0.08 + attachedPlaces.length * 0.08 + corridorCount * 0.08 + crossingCount * 0.08 + countryEvents.length * 0.12);
  const title = countryEvents.some((event) => /expanded/i.test(event.title))
    ? "Their country has opened outward"
    : returnPlaces.length >= 2
      ? "Return places anchor the map"
      : corridorCount + crossingCount > 0
        ? "Routes organize the known country"
        : "Their country is still taking shape";
  const summary = countryEvents.some((event) => /expanded/i.test(event.title))
    ? "Older history shows the known range widening, while recent memory still holds the places and routes."
    : returnPlaces.length >= 2
      ? "Repeated returns give the band a few places that matter more than the surrounding blank country."
      : corridorCount + crossingCount > 0
        ? "Routes and crossings are part of how this band reads the land."
        : "Known places exist, but few have become strong landmarks yet.";

  return makeDraft("familiar_country", title, summary, score, evidence);
}

function buildMobilityCard(band: Band, events: readonly CanonicalEvent[]): CardDraft {
  const evidence: BandIdentityEvidenceRef[] = [];
  const moveEvents = band.recentResidentialMoveEvents ?? [];
  const routeEvents = events.filter((event) => event.family === "route_crossing" || /route|move|camp/i.test(`${event.title} ${event.summary}`));
  const routeUse = Object.values(band.travelCorridors).reduce((sum, route) => sum + route.useCount, 0);
  const returnPlaceCount = Object.values(band.placeMemory).filter((place) => place.isReturnPlace || place.attachment >= 0.5).length;
  const daughter = band.deepHistory?.founding.kind === "fission_daughter" || band.parentBandId !== undefined;

  if (moveEvents.length > 0) {
    evidence.push(residentialMoveEvidence(moveEvents[0], moveEvents.length));
  }
  if (routeUse > 0) {
    evidence.push({
      kind: "route_memory",
      label: countLabel(routeUse, "remembered route use", "remembered route uses"),
      sourceId: `route-use:${String(band.id)}`,
      scope: "recent",
      livedStatus: "personally_lived",
      confidence: clamp01(routeUse / 10),
      reasonIds: [],
    });
  }
  if (returnPlaceCount > 0) {
    evidence.push({
      kind: "place_memory",
      label: countLabel(returnPlaceCount, "camp-attached place", "camp-attached places"),
      sourceId: `camp-attachment:${String(band.id)}`,
      scope: "recent",
      livedStatus: "personally_lived",
      confidence: clamp01(returnPlaceCount / 4),
      reasonIds: [],
    });
  }
  evidence.push(...routeEvents.slice(0, 2).map((event) => eventEvidence(event, "movement memory")));
  if (daughter && band.deepHistory?.founding !== undefined) {
    evidence.push(foundingEvidence(band, "daughter founding"));
  }

  const score = clamp01(moveEvents.length * 0.12 + routeUse * 0.06 + returnPlaceCount * 0.12 + routeEvents.length * 0.12 + (daughter ? 0.2 : 0));
  const title = daughter
    ? "This branch has its own movement story"
    : routeUse >= 4
      ? "They move by remembered routes"
      : returnPlaceCount >= 2
        ? "They keep returning to known camps"
        : moveEvents.length > 0
          ? "Recent camp moves stand out"
          : "Movement pattern still open";
  const summary = daughter
    ? "After founding, this band begins its own movement story; parent routes remain inheritance, not personal experience."
    : routeUse >= 4
      ? "Repeated corridors now matter more than isolated one-off moves."
      : returnPlaceCount >= 2
        ? "Known camp places pull them back, without implying settled life."
        : moveEvents.length > 0
          ? "The camp has shifted recently, though the pattern is not yet old or durable."
          : "The record is not strong enough to describe a narrow way of moving.";

  return makeDraft("mobility_style", title, summary, score, evidence);
}

function buildRiskMemoryCard(band: Band, events: readonly CanonicalEvent[]): CardDraft {
  const evidence: BandIdentityEvidenceRef[] = [];
  const pressureEvents = events.filter((event) => event.family === "food_water_pressure");
  const failedMoves = (band.recentResidentialMoveEvents ?? []).filter((move) => move.status === "failed_no_route" || move.hardshipOutcome === "rejected");
  const riskyCrossings = Object.values(band.crossingMemories).filter((crossing) => crossing.riskMemory >= 0.45);
  const failureStories = band.relationshipMemory?.failureStories ?? [];
  const waterStress = band.seasonalSupport?.currentSeasonSupport.waterStress ?? 0;
  const foodStress = band.seasonalSupport?.currentSeasonSupport.foodStress ?? 0;

  evidence.push(...pressureEvents.slice(0, 2).map((event) => eventEvidence(event, "pressure remembered")));
  if (failedMoves.length > 0) {
    evidence.push(residentialMoveEvidence(failedMoves[0], failedMoves.length, "blocked move memory"));
  }
  if (riskyCrossings.length > 0) {
    const crossing = riskyCrossings.slice().sort((left, right) => right.riskMemory - left.riskMemory)[0];
    evidence.push({
      kind: "crossing_memory",
      label: countLabel(riskyCrossings.length, "risky crossing memory", "risky crossing memories"),
      sourceId: `crossing:${String(crossing.riverId)}:${String(crossing.crossingTileA)}:${String(crossing.crossingTileB)}`,
      scope: "recent",
      livedStatus: "personally_lived",
      confidence: crossing.riskMemory,
      tileId: crossing.crossingTileA,
      reasonIds: capReasonIds(crossing.reasonIds),
    });
  }
  if (failureStories.length > 0) {
    const story = failureStories.slice().sort((left, right) => right.strength - left.strength)[0];
    evidence.push({
      kind: "relationship_memory",
      label: failureStoryLabel(story.kind),
      sourceId: `failure-story:${String(story.kind)}:${String(story.tileId ?? band.position)}`,
      scope: "recent",
      livedStatus: "personally_lived",
      confidence: story.strength,
      tileId: story.tileId,
      reasonIds: capReasonIds(story.reasonIds),
    });
  }
  if (band.seasonalSupport !== undefined) {
    evidence.push({
      kind: "seasonal_support",
      label: waterStress >= foodStress ? "water pressure" : "food pressure",
      sourceId: `seasonal-pressure:${String(band.id)}:${band.seasonalSupport.currentSeasonSupport.year}:${band.seasonalSupport.currentSeasonSupport.season}`,
      scope: "current",
      livedStatus: "personally_lived",
      confidence: clamp01(Math.max(waterStress, foodStress)),
      reasonIds: [],
    });
  }
  if (evidence.length === 0) {
    evidence.push(demographyEvidence("current mortality pressure", band, band.demography.mortalityPressure));
  }

  const riskScore = clamp01(pressureEvents.length * 0.14 + failedMoves.length * 0.18 + riskyCrossings.length * 0.16 + failureStories.length * 0.1 + Math.max(waterStress, foodStress) * 0.35);
  const title = riskyCrossings.length > 0
    ? "Crossings have taught caution"
    : failedMoves.length > 0
      ? "Blocked paths have taught caution"
      : waterStress > 0.45
        ? "Water pressure teaches caution"
        : foodStress > 0.45 || pressureEvents.length > 0
          ? "Food pressure teaches caution"
          : "Caution is still faint";
  const summary = riskyCrossings.length > 0
    ? "Risky or uncertain crossings have become part of how the band judges the land."
    : failedMoves.length > 0
      ? "Recent moves were blocked or rejected, so caution comes from a real failed path."
      : waterStress > 0.45
        ? "Water is the clearest pressure in the current record."
        : foodStress > 0.45 || pressureEvents.length > 0
          ? "Food or fallback pressure is present, but the longer pattern is still forming."
          : "There is no strong repeated danger shaping the band yet.";

  return makeDraft("risk_memory", title, summary, riskScore, evidence, riskScore < 0.35 ? "The caution is visible, but still faint." : undefined);
}

function buildSocialDemographicCard(band: Band, events: readonly CanonicalEvent[]): CardDraft {
  const evidence: BandIdentityEvidenceRef[] = [];
  const population = Math.max(1, band.demography.population);
  const dependentShare = band.demography.dependents / population;
  const elderShare = band.demography.elders / population;
  const adultShare = band.demography.workingAdults / population;
  const demographicEvents = events.filter((event) => event.family === "demography" || event.family === "contact_social");

  evidence.push(demographyEvidence(`${band.demography.workingAdults} working adults`, band, adultShare));
  evidence.push(demographyEvidence(`${band.demography.dependents} dependents`, band, dependentShare));
  if (band.demography.elders > 0) {
    evidence.push(demographyEvidence(`${band.demography.elders} elders`, band, elderShare));
  }
  evidence.push(...demographicEvents.slice(0, 2).map((event) => eventEvidence(event, "people changes")));

  const laborThin = band.demography.workingAdults <= band.demography.dependents + band.demography.elders;
  const recentSplit = band.fissionEvents.length > 0 || events.some((event) => event.type === "fission_split");
  const score = clamp01(Math.abs(dependentShare - 0.32) + elderShare * 0.6 + (laborThin ? 0.25 : 0) + demographicEvents.length * 0.12 + (recentSplit ? 0.18 : 0));
  const title = recentSplit
    ? "A recent split shapes the group"
    : laborThin
      ? "Care burden narrows spare labor"
      : elderShare > 0.18
        ? "Older people stand out in the group"
        : demographicEvents.some((event) => /recovered/i.test(event.title))
          ? "Recovery is part of the people story"
          : demographicEvents.length > 0
            ? "The group has been changing"
            : "The age mix does not set them apart";
  const summary = recentSplit
    ? "A split or daughter branch is now part of how this group is shaped."
    : laborThin
      ? "Dependents and elders take up enough of the population that spare adult labor is limited."
    : elderShare > 0.18
        ? "The cohort shape makes elder presence visible without turning it into kinship or social rank."
        : demographicEvents.some((event) => /recovered/i.test(event.title))
          ? "The record shows population recovery as part of this band's history."
          : demographicEvents.length > 0
            ? "Births, deaths, or other people changes show up often enough to matter."
            : "The current mix of adults, dependents, and elders does not strongly set them apart.";

  return makeDraft("social_demographic", title, summary, score, evidence, score < 0.35 ? "This is a faint clue, not a fixed social type." : undefined);
}

function buildInheritanceCard(band: Band, events: readonly CanonicalEvent[]): CardDraft {
  const evidence: BandIdentityEvidenceRef[] = [];
  const history = band.deepHistory;
  const inheritedEvents = events.filter((event) => event.memoryScope === "inherited" || event.livedStatus === "inherited_not_personally_lived");
  const daughter = history?.founding.kind === "fission_daughter" || band.parentBandId !== undefined;

  if (history !== undefined) {
    evidence.push(foundingEvidence(band, daughter ? "daughter founding" : "origin beginning"));
    for (const summary of history.inheritedEraSummaries.slice(0, 2)) {
      evidence.push({
        kind: "deep_history",
        label: "parent-era memory",
        sourceId: `inherited-era:${String(summary.sourceBandId)}:${summary.startYear}-${summary.endYear}`,
        scope: "inherited",
        livedStatus: "inherited_not_personally_lived",
        confidence: 0.55,
        reasonIds: [],
      });
    }
  }
  evidence.push(...inheritedEvents.slice(0, 2).map((event) => eventEvidence(event, "inherited memory")));
  if (evidence.length === 0) {
    evidence.push({
      kind: "founding_snapshot",
      label: band.parentBandId === undefined ? "origin beginning" : "parent link",
      sourceId: `identity-origin:${String(band.id)}`,
      scope: "current",
      livedStatus: band.parentBandId === undefined ? "personally_lived" : "inherited_not_personally_lived",
      confidence: 0.4,
      reasonIds: [],
    });
  }

  const inheritedCount = evidence.filter((entry) => entry.livedStatus === "inherited_not_personally_lived").length;
  const score = clamp01((daughter ? 0.45 : 0.2) + inheritedCount * 0.16 + (history?.ancestryLine.length ?? 0) * 0.08);
  const title = daughter || inheritedCount > 0
    ? "They carry parent memory separately"
    : "Most of the portrait comes from their own life";
  const summary = daughter || inheritedCount > 0
    ? "Parent history travels with the band, but its own life begins at founding."
    : "The clues come mostly from this band's own beginning, movement, memory, and events.";

  return makeDraft("inheritance", title, summary, score, evidence);
}

function makeDraft(
  dimension: BandIdentityDimension,
  title: string,
  summary: string,
  score: number,
  evidence: readonly BandIdentityEvidenceRef[],
  uncertainty?: string,
): CardDraft {
  const cappedEvidence = capIdentityEvidence(evidence);
  return {
    dimension,
    title,
    summary,
    strength: strengthFor(score, cappedEvidence),
    confidence: confidenceFor(score, cappedEvidence),
    evidence: cappedEvidence,
    uncertainty,
    score,
  };
}

function finalizeCard(band: Band, draft: CardDraft): BandIdentityCard {
  const relatedEventIds = capStrings(draft.evidence.map((entry) => entry.eventId), LINK_PER_CARD_CAP);
  const relatedChronicleLinkIds = capStrings(draft.evidence.map((entry) => entry.chronicleLinkId), LINK_PER_CARD_CAP);
  const sourceKinds = [...new Set(draft.evidence.map((entry) => entry.kind))]
    .sort((left, right) => left.localeCompare(right));

  return {
    id: `band-identity:${String(band.id)}:${draft.dimension}`,
    dimension: draft.dimension,
    title: draft.title,
    summary: draft.summary,
    strength: draft.strength,
    confidence: draft.confidence,
    evidence: draft.evidence,
    uncertainty: draft.uncertainty,
    relatedEventIds,
    relatedChronicleLinkIds,
    livedEvidenceCount: draft.evidence.filter((entry) => entry.livedStatus === "personally_lived").length,
    inheritedEvidenceCount: draft.evidence.filter((entry) => entry.livedStatus === "inherited_not_personally_lived").length,
    sourceKinds,
  };
}

function buildSummaryLines(cards: readonly BandIdentityCard[]): readonly string[] {
  const strongest = cards
    .filter((card) => card.strength !== "weak" && card.strength !== "uncertain")
    .sort((left, right) => right.confidence - left.confidence || dimensionOrder(left.dimension) - dimensionOrder(right.dimension));
  const inherited = cards.reduce((sum, card) => sum + card.inheritedEvidenceCount, 0);
  const weak = cards.filter((card) => card.strength === "weak" || card.strength === "uncertain").length;
  const lines: string[] = [];

  if (strongest.length >= 2) {
    lines.push(`What sets them apart most: ${lowerFirst(strongest[0].title)}; ${lowerFirst(strongest[1].title)}.`);
  } else if (strongest.length === 1) {
    lines.push(`What sets them apart most: ${lowerFirst(strongest[0].title)}.`);
  } else {
    lines.push("They are still hard to distinguish from nearby bands; the clues remain faint.");
  }

  if (inherited > 0) {
    lines.push("Parent memory is shown separately from what this band has lived itself.");
  } else {
    lines.push("Most clues come from this band's own life, not inherited parent history.");
  }

  if (weak > 0) {
    lines.push(`${weak} clue${weak === 1 ? " remains" : "s remain"} faint rather than overclaimed.`);
  }

  return lines;
}

function summaryTitle(cards: readonly BandIdentityCard[]): string {
  const strongest = cards
    .filter((card) => card.strength !== "weak" && card.strength !== "uncertain")
    .sort((left, right) => right.confidence - left.confidence || dimensionOrder(left.dimension) - dimensionOrder(right.dimension))[0];
  if (strongest === undefined) {
    return "A band still taking shape";
  }
  switch (strongest.dimension) {
    case "subsistence":
      if (/gathered/i.test(strongest.title)) {
        return "A band leaning on gathered food";
      }
      if (/water/i.test(strongest.title)) {
        return "A band marked by water foods";
      }
      if (/scarcity/i.test(strongest.title)) {
        return "A band shaped by scarcity";
      }
      return "A band with food habits still forming";
    case "familiar_country":
      return "A band with a widening country";
    case "mobility_style":
      if (/branch/i.test(strongest.title)) {
        return "A daughter band with its own path";
      }
      if (/remembered routes/i.test(strongest.title)) {
        return "A band of remembered routes";
      }
      if (/returning/i.test(strongest.title) || /camps/i.test(strongest.title)) {
        return "A band of returning camps";
      }
      return "A band shaped by movement";
    case "risk_memory":
      return "A band learning caution";
    case "social_demographic":
      return "A band shaped by its people";
    case "inheritance":
      return "A band carrying earlier memory";
  }
}

function eventEvidence(event: CanonicalEvent, label: string): BandIdentityEvidenceRef {
  return {
    kind: "canonical_event",
    label,
    sourceId: event.id,
    scope: event.memoryScope === "durable" ? "durable" : event.memoryScope === "inherited" ? "inherited" : "recent",
    livedStatus: event.livedStatus,
    confidence: clamp01(event.significance),
    eventId: event.id,
    chronicleLinkId: event.chronicleLinkIds[0],
    tileId: event.involvedTileIds[0],
    routeId: event.involvedRouteIds[0],
    reasonIds: capReasonIds(event.sourceReasonIds),
  };
}

function activityEvidence(label: string, count: number, band: Band): BandIdentityEvidenceRef {
  return {
    kind: "activity",
    label: count > 1 ? `repeated ${label}` : label,
    sourceId: `activity:${String(band.id)}:${label.replace(/\s+/g, "-")}`,
    scope: "recent",
    livedStatus: "personally_lived",
    confidence: clamp01(0.35 + count * 0.08),
    reasonIds: [],
  };
}

function residentialMoveEvidence(
  event: ResidentialMoveEvent,
  count: number,
  label = "camp move",
): BandIdentityEvidenceRef {
  return {
    kind: "residential_move",
    label: count > 1 ? `repeated ${label}` : label,
    sourceId: `residential-move:${String(event.eventId)}`,
    scope: "recent",
    livedStatus: "personally_lived",
    confidence: clamp01(0.4 + (event.hardshipRisk ?? 0) * 0.4),
    tileId: event.toTileId,
    reasonIds: capReasonIds(event.reasonIds),
  };
}

function demographyEvidence(label: string, band: Band, confidence: number): BandIdentityEvidenceRef {
  return {
    kind: "demography",
    label,
    sourceId: `demography:${String(band.id)}:${band.demography.lastDemographicUpdate.year}:${band.demography.lastDemographicUpdate.season}`,
    scope: "current",
    livedStatus: "personally_lived",
    confidence: clamp01(confidence),
    reasonIds: capReasonIds(band.demography.sourceReasonIds),
  };
}

function foundingEvidence(band: Band, label: string): BandIdentityEvidenceRef {
  const founding = band.deepHistory?.founding;
  return {
    kind: "founding_snapshot",
    label,
    sourceId: founding === undefined
      ? `founding:${String(band.id)}:unknown`
      : `founding:${String(founding.bandId)}:${founding.foundedAt.year}`,
    scope: "durable",
    livedStatus: founding?.kind === "fission_daughter" ? "personally_lived" : "personally_lived",
    confidence: 0.72,
    chronicleLinkId: founding === undefined ? undefined : `year:${founding.foundedAt.year}`,
    tileId: founding?.foundingTileId,
    reasonIds: capReasonIds(founding?.creationReasonIds ?? []),
  };
}

function capIdentityEvidence(evidence: readonly BandIdentityEvidenceRef[]): readonly BandIdentityEvidenceRef[] {
  const seen = new Set<string>();
  const sorted = [...evidence]
    .filter((entry) => entry.label.length > 0)
    .sort((left, right) =>
      scopeRank(right.scope) - scopeRank(left.scope) ||
      right.confidence - left.confidence ||
      left.kind.localeCompare(right.kind) ||
      left.label.localeCompare(right.label));
  const result: BandIdentityEvidenceRef[] = [];

  for (const entry of sorted) {
    const key = `${entry.kind}:${entry.label}:${entry.sourceId}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(entry);
    if (result.length >= EVIDENCE_PER_CARD_CAP) {
      break;
    }
  }

  return result;
}

function countActivityTasks(band: Band): Partial<Record<IntraSeasonTripTaskGroupType, number>> {
  const counts: Partial<Record<IntraSeasonTripTaskGroupType, number>> = {};
  for (const trip of band.recentIntraSeasonTrips ?? []) {
    counts[trip.taskGroupType] = (counts[trip.taskGroupType] ?? 0) + 1;
  }
  for (const entry of band.activityLaborSummary?.peopleByActivityType ?? []) {
    counts[entry.taskGroupType] = Math.max(counts[entry.taskGroupType] ?? 0, entry.groupCount);
  }
  return counts;
}

function strengthFor(score: number, evidence: readonly BandIdentityEvidenceRef[]): BandIdentityStrength {
  if (evidence.some((entry) => entry.scope === "inherited") && evidence.every((entry) => entry.livedStatus === "inherited_not_personally_lived")) {
    return "inherited";
  }
  if (evidence.some((entry) => entry.scope === "durable") && score >= 0.66) {
    return "durable";
  }
  if (score >= 0.68) {
    return "established";
  }
  if (score >= 0.42) {
    return "forming";
  }
  if (score > 0.18) {
    return "weak";
  }
  return "uncertain";
}

function confidenceFor(score: number, evidence: readonly BandIdentityEvidenceRef[]): number {
  if (evidence.length === 0) {
    return 0;
  }
  const evidenceConfidence = evidence.reduce((sum, entry) => sum + entry.confidence, 0) / evidence.length;
  return clamp01(score * 0.55 + evidenceConfidence * 0.45);
}

function countEvidenceKinds(evidence: readonly BandIdentityEvidenceRef[]): Readonly<Record<BandIdentityEvidenceKind, number>> {
  const counts = { ...EMPTY_EVIDENCE_COUNTS };
  for (const entry of evidence) {
    counts[entry.kind] += 1;
  }
  return counts;
}

function failureStoryLabel(kind: string): string {
  switch (kind) {
    case "bad_crossing":
      return "bad crossing memory";
    case "cold_route":
      return "cold route memory";
    case "bad_water":
      return "bad water memory";
    case "sickness_camp":
    case "dirty_camp":
      return "camp sickness memory";
    case "overuse_collapse":
      return "overuse memory";
    case "failed_breakaway":
      return "failed breakaway memory";
    default:
      return kind.replace(/_/g, " ");
  }
}

function countLabel(count: number, singular: string, plural: string): string {
  if (count <= 1) {
    return `1 ${singular}`;
  }
  if (count >= 20) {
    return `many ${plural}`;
  }
  if (count >= 6) {
    return `several ${plural}`;
  }
  return `${count} ${plural}`;
}

function dimensionOrder(dimension: BandIdentityDimension): number {
  return DIMENSION_ORDER.indexOf(dimension);
}

function scopeRank(scope: BandIdentityEvidenceScope): number {
  switch (scope) {
    case "durable":
      return 4;
    case "inherited":
      return 3;
    case "recent":
      return 2;
    case "current":
      return 1;
  }
}

function capReasonIds(ids: readonly ReasonId[]): readonly ReasonId[] {
  return ids.slice(0, 4);
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

function lowerFirst(text: string): string {
  return text.length === 0 ? text : `${text.charAt(0).toLowerCase()}${text.slice(1)}`;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function byteLengthUtf8(value: string): number {
  return new TextEncoder().encode(value).length;
}
