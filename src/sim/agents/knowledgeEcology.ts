import type {
  ActivityReturnResourceKind,
  Band,
  IntraSeasonTripRecord,
  IntraSeasonTripTaskGroupType,
  TravelCorridorMemory,
} from "./types";
import { deriveCanonicalEvents, type CanonicalEvent } from "./eventSystem";
import type { BandId, Coord, ReasonId, RouteId, TileId } from "../core/types";
import type { WorldState } from "../world/types";

const KNOWLEDGE_ITEM_CAP = 12;
const PER_DOMAIN_CAP = 3;
const EVIDENCE_PER_ITEM_CAP = 3;
const LINK_PER_ITEM_CAP = 4;
const SAMPLE_CAP = 10;

export type KnowledgeEcologyDomain =
  | "route_corridor"
  | "crossing"
  | "place_country"
  | "food_work"
  | "water_refuge"
  | "risk_caution"
  | "social_contact"
  | "inherited_memory";

export type KnowledgeCarrierCategory =
  | "whole_band"
  | "working_adults"
  | "returning_activity_party"
  | "camp_group_heard"
  | "daughter_inherited_memory"
  | "elder_or_old_memory"
  | "narrow_practical_carrier"
  | "uncertain_carrier";

export type KnowledgeTransmissionStatus =
  | "personally_practiced"
  | "heard_from_returning_party"
  | "widely_shared"
  | "inherited_story"
  | "durable_memory"
  | "fading_or_uncertain";

export type KnowledgePracticalStatus =
  | "practical"
  | "heard_about"
  | "story_only"
  | "inherited_not_practiced"
  | "fading_uncertain";

export type KnowledgeEvidenceKind =
  | "canonical_event"
  | "deep_history"
  | "activity_trip"
  | "activity_summary"
  | "place_memory"
  | "route_memory"
  | "crossing_memory"
  | "reported_knowledge"
  | "demography"
  | "founding_snapshot"
  | "residential_move";

export type KnowledgeMemoryScope = "recent" | "durable" | "inherited" | "current";
export type KnowledgeLivedStatus = "personally_lived" | "inherited_not_personally_lived";
export type KnowledgeConfidenceBand = "faint" | "forming" | "reliable" | "durable" | "inherited" | "fading";

export interface KnowledgeEvidenceRef {
  readonly kind: KnowledgeEvidenceKind;
  readonly label: string;
  readonly sourceId: string;
  readonly confidence: number;
  readonly scope: KnowledgeMemoryScope;
  readonly livedStatus: KnowledgeLivedStatus;
  readonly eventId?: string;
  readonly chronicleLinkId?: string;
  readonly tileId?: TileId;
  readonly routeId?: RouteId;
  readonly reasonIds: readonly ReasonId[];
}

export interface KnowledgeEcologyItem {
  readonly id: string;
  readonly domain: KnowledgeEcologyDomain;
  readonly title: string;
  readonly summary: string;
  readonly confidence: number;
  readonly confidenceBand: KnowledgeConfidenceBand;
  readonly carrier: KnowledgeCarrierCategory;
  readonly transmission: KnowledgeTransmissionStatus;
  readonly practicalStatus: KnowledgePracticalStatus;
  readonly memoryScope: KnowledgeMemoryScope;
  readonly livedStatus: KnowledgeLivedStatus;
  readonly firstKnownYear?: number;
  readonly lastReinforcedYear?: number;
  readonly fading: boolean;
  readonly uncertainty?: string;
  readonly evidence: readonly KnowledgeEvidenceRef[];
  readonly relatedEventIds: readonly string[];
  readonly relatedChronicleLinkIds: readonly string[];
  readonly involvedTileIds: readonly TileId[];
  readonly involvedRouteIds: readonly RouteId[];
}

export interface KnowledgeEcologyProfile {
  readonly bandId: BandId;
  readonly generatedAtYear: number;
  readonly generatedAtTick: number;
  readonly overviewTitle: string;
  readonly overviewLines: readonly string[];
  readonly items: readonly KnowledgeEcologyItem[];
  readonly domainsPresent: readonly KnowledgeEcologyDomain[];
  readonly domainCounts: Readonly<Record<KnowledgeEcologyDomain, number>>;
  readonly carrierCounts: Readonly<Record<KnowledgeCarrierCategory, number>>;
  readonly livedItemCount: number;
  readonly inheritedItemCount: number;
  readonly practicalItemCount: number;
  readonly storyOnlyItemCount: number;
  readonly heardItemCount: number;
  readonly fadingItemCount: number;
  readonly activityEvidenceCount: number;
  readonly eventEvidenceCount: number;
  readonly deepHistoryEvidenceCount: number;
  readonly memoryEvidenceCount: number;
  readonly caps: {
    readonly itemCap: number;
    readonly perDomainCap: number;
    readonly evidencePerItemCap: number;
    readonly linkPerItemCap: number;
    readonly capsHeld: boolean;
  };
  readonly integrity: {
    readonly selectedBandOnly: true;
    readonly projectionOnly: true;
    readonly noBehaviorInfluence: true;
    readonly evidenceBacked: boolean;
    readonly usesExistingActivityPartiesOnly: true;
    readonly ignoresLegacyStartingSkills: true;
    readonly inheritedSeparated: boolean;
    readonly practicalVsStorySeparated: boolean;
  };
  readonly technicalProof: {
    readonly payloadBytesEstimate: number;
    readonly maxItemPayloadBytes: number;
    readonly evidenceKindCounts: Readonly<Record<KnowledgeEvidenceKind, number>>;
    readonly sourceIdSamples: readonly string[];
    readonly relatedEventIdSamples: readonly string[];
    readonly unresolvedReferenceCount: number;
  };
}

interface KnowledgeItemDraft extends Omit<
  KnowledgeEcologyItem,
  "id" | "confidenceBand" | "evidence" | "relatedEventIds" | "relatedChronicleLinkIds" | "involvedTileIds" | "involvedRouteIds"
> {
  readonly score: number;
  readonly sourceKey: string;
  readonly evidence: readonly KnowledgeEvidenceRef[];
}

const DOMAIN_ORDER: readonly KnowledgeEcologyDomain[] = [
  "route_corridor",
  "crossing",
  "place_country",
  "food_work",
  "water_refuge",
  "risk_caution",
  "social_contact",
  "inherited_memory",
];

const EMPTY_DOMAIN_COUNTS: Readonly<Record<KnowledgeEcologyDomain, number>> = {
  route_corridor: 0,
  crossing: 0,
  place_country: 0,
  food_work: 0,
  water_refuge: 0,
  risk_caution: 0,
  social_contact: 0,
  inherited_memory: 0,
};

const EMPTY_CARRIER_COUNTS: Readonly<Record<KnowledgeCarrierCategory, number>> = {
  whole_band: 0,
  working_adults: 0,
  returning_activity_party: 0,
  camp_group_heard: 0,
  daughter_inherited_memory: 0,
  elder_or_old_memory: 0,
  narrow_practical_carrier: 0,
  uncertain_carrier: 0,
};

const EMPTY_EVIDENCE_COUNTS: Readonly<Record<KnowledgeEvidenceKind, number>> = {
  canonical_event: 0,
  deep_history: 0,
  activity_trip: 0,
  activity_summary: 0,
  place_memory: 0,
  route_memory: 0,
  crossing_memory: 0,
  reported_knowledge: 0,
  demography: 0,
  founding_snapshot: 0,
  residential_move: 0,
};

export function deriveKnowledgeEcologyProfile(world: WorldState, band: Band): KnowledgeEcologyProfile {
  const eventState = deriveCanonicalEvents(world, band);
  const currentYear = world.time.year;
  const drafts = [
    ...buildRouteKnowledge(band, eventState.events, currentYear),
    ...buildCrossingKnowledge(band, eventState.events, currentYear),
    ...buildPlaceCountryKnowledge(band, eventState.events, currentYear),
    ...buildFoodWorkKnowledge(band, eventState.events),
    ...buildWaterRefugeKnowledge(band, eventState.events),
    ...buildRiskKnowledge(band, eventState.events, currentYear),
    ...buildSocialKnowledge(band),
    ...buildInheritedKnowledge(band, eventState.events, currentYear),
  ];
  const items = capKnowledgeItems(drafts).map((draft) => finalizeItem(band, draft));
  const evidence = items.flatMap((item) => item.evidence);
  const domainCounts = countDomains(items);
  const carrierCounts = countCarriers(items);
  const evidenceKindCounts = countEvidenceKinds(evidence);
  const payloadBytesEstimate = byteLengthUtf8(JSON.stringify({
    bandId: band.id,
    generatedAtYear: currentYear,
    items,
  }));
  const itemPayloads = items.map((item) => byteLengthUtf8(JSON.stringify(item)));

  return {
    bandId: band.id,
    generatedAtYear: currentYear,
    generatedAtTick: Number(world.time.tick),
    overviewTitle: overviewTitle(items),
    overviewLines: overviewLines(items),
    items,
    domainsPresent: DOMAIN_ORDER.filter((domain) => domainCounts[domain] > 0),
    domainCounts,
    carrierCounts,
    livedItemCount: items.filter((item) => item.livedStatus === "personally_lived").length,
    inheritedItemCount: items.filter((item) => item.livedStatus === "inherited_not_personally_lived").length,
    practicalItemCount: items.filter((item) => item.practicalStatus === "practical").length,
    storyOnlyItemCount: items.filter((item) => item.practicalStatus === "story_only" || item.practicalStatus === "inherited_not_practiced").length,
    heardItemCount: items.filter((item) => item.practicalStatus === "heard_about").length,
    fadingItemCount: items.filter((item) => item.fading || item.practicalStatus === "fading_uncertain").length,
    activityEvidenceCount: evidence.filter((entry) => entry.kind === "activity_trip" || entry.kind === "activity_summary").length,
    eventEvidenceCount: evidence.filter((entry) => entry.kind === "canonical_event").length,
    deepHistoryEvidenceCount: evidence.filter((entry) => entry.kind === "deep_history" || entry.kind === "founding_snapshot").length,
    memoryEvidenceCount: evidence.filter((entry) =>
      entry.kind === "place_memory" ||
      entry.kind === "route_memory" ||
      entry.kind === "crossing_memory" ||
      entry.kind === "reported_knowledge").length,
    caps: {
      itemCap: KNOWLEDGE_ITEM_CAP,
      perDomainCap: PER_DOMAIN_CAP,
      evidencePerItemCap: EVIDENCE_PER_ITEM_CAP,
      linkPerItemCap: LINK_PER_ITEM_CAP,
      capsHeld: items.length <= KNOWLEDGE_ITEM_CAP && items.every((item) =>
        item.evidence.length <= EVIDENCE_PER_ITEM_CAP &&
        item.relatedEventIds.length <= LINK_PER_ITEM_CAP &&
        item.relatedChronicleLinkIds.length <= LINK_PER_ITEM_CAP),
    },
    integrity: {
      selectedBandOnly: true,
      projectionOnly: true,
      noBehaviorInfluence: true,
      evidenceBacked: items.every((item) => item.evidence.length > 0),
      usesExistingActivityPartiesOnly: true,
      ignoresLegacyStartingSkills: true,
      inheritedSeparated: items.every((item) =>
        item.livedStatus === "personally_lived" ||
        item.evidence.every((entry) => entry.livedStatus === "inherited_not_personally_lived")),
      practicalVsStorySeparated: items.every((item) =>
        item.practicalStatus === "practical" ||
        item.transmission !== "personally_practiced"),
    },
    technicalProof: {
      payloadBytesEstimate,
      maxItemPayloadBytes: Math.max(0, ...itemPayloads),
      evidenceKindCounts,
      sourceIdSamples: capStrings(evidence.map((entry) => entry.sourceId), SAMPLE_CAP),
      relatedEventIdSamples: capStrings(items.flatMap((item) => item.relatedEventIds), SAMPLE_CAP),
      unresolvedReferenceCount: 0,
    },
  };
}

function buildRouteKnowledge(
  band: Band,
  events: readonly CanonicalEvent[],
  currentYear: number,
): readonly KnowledgeItemDraft[] {
  const routeEvents = events.filter((event) => event.family === "route_crossing");
  const activityTrips = recentTripsByTask(band, ["memory_refresh_group"]);
  const routeInfoTrips = (band.recentIntraSeasonTrips ?? []).filter((trip) =>
    trip.resourceReturn.returnedResourceKind === "route_information" ||
    trip.activityMemoryEffect.effectType === "route_memory_refreshed");
  const corridors = Object.values(band.travelCorridors)
    .sort(compareCorridors)
    .slice(0, 2);

  if (corridors.length === 0 && routeEvents.length === 0 && routeInfoTrips.length === 0) {
    return [];
  }

  const primary = corridors[0];
  const evidence: KnowledgeEvidenceRef[] = [];
  if (primary !== undefined) {
    evidence.push(routeEvidence(primary, currentYear));
  }
  evidence.push(...routeEvents.slice(0, 2).map((event) => eventEvidence(event, "route event in the record")));
  const trip = routeInfoTrips[0] ?? activityTrips[0];
  if (trip !== undefined) {
    evidence.push(activityEvidence(trip, routeTripEvidenceLabel(trip)));
  }

  const useCount = primary?.useCount ?? routeEvents.length;
  const age = primary === undefined ? 0 : Math.max(0, currentYear - primary.lastUsedAt.year);
  const fading = primary !== undefined && age >= 12 && routeInfoTrips.length === 0;
  const confidence = clamp01((primary?.confidence ?? 0.35) + useCount * 0.04 + routeEvents.length * 0.08 - (fading ? 0.16 : 0));

  return [makeDraft({
    domain: "route_corridor",
    sourceKey: primary?.id ?? "route-events",
    title: fading ? "Route evidence is old and thin" : "Routes are known through use",
    summary: fading
      ? "A remembered corridor remains in evidence, but recent route parties have not refreshed it."
      : "Route memory is backed by corridor use, movement records, or a returning route party.",
    score: confidence + routeEvents.length * 0.05,
    confidence,
    carrier: trip === undefined ? "working_adults" : "returning_activity_party",
    transmission: fading ? "fading_or_uncertain" : trip === undefined ? "personally_practiced" : "heard_from_returning_party",
    practicalStatus: fading ? "fading_uncertain" : "practical",
    memoryScope: routeEvents.some((event) => event.memoryScope === "durable") ? "durable" : "recent",
    livedStatus: "personally_lived",
    lastReinforcedYear: primary?.lastUsedAt.year ?? tripYear(trip),
    fading,
    uncertainty: fading ? "The route is old enough that practical confidence should not be treated as perfect." : undefined,
    evidence,
  })];
}

function buildCrossingKnowledge(
  band: Band,
  events: readonly CanonicalEvent[],
  currentYear: number,
): readonly KnowledgeItemDraft[] {
  const crossingEntries = Object.entries(band.crossingMemories)
    .sort(([, left], [, right]) =>
      right.useCount - left.useCount ||
      right.successConfidence - left.successConfidence ||
      String(left.crossingTileA).localeCompare(String(right.crossingTileA)))
    .slice(0, 2);
  const crossingEvents = events.filter((event) =>
    event.family === "route_crossing" && /crossing|ford|water/i.test(`${event.title} ${event.summary}`));
  const waterRiskTrips = (band.recentIntraSeasonTrips ?? []).filter((trip) =>
    trip.activityOutcome === "failed_due_to_water_risk" || trip.activityOutcome === "abandoned_due_to_risk");

  if (crossingEntries.length === 0 && crossingEvents.length === 0 && waterRiskTrips.length === 0) {
    return [];
  }

  const [key, crossing] = crossingEntries[0] ?? [];
  const evidence: KnowledgeEvidenceRef[] = [];
  if (crossing !== undefined) {
    evidence.push({
      kind: "crossing_memory",
      label: crossingEvidenceLabel(crossing),
      sourceId: `crossing:${key}`,
      confidence: clamp01(crossing.successConfidence),
      scope: "recent",
      livedStatus: "personally_lived",
      tileId: crossing.crossingTileA,
      reasonIds: capReasonIds(crossing.reasonIds),
    });
  }
  evidence.push(...crossingEvents.slice(0, 2).map((event) => eventEvidence(event, "crossing event")));
  if (waterRiskTrips[0] !== undefined) {
    evidence.push(activityEvidence(waterRiskTrips[0], riskTripEvidenceLabel(waterRiskTrips[0])));
  }

  const age = crossing === undefined ? 0 : Math.max(0, currentYear - crossing.lastUsedAt.year);
  const warningOnly = crossing !== undefined && crossing.riskMemory >= 0.55 && crossing.successConfidence < 0.45;
  const fading = age >= 10 && waterRiskTrips.length === 0;
  const confidence = clamp01((crossing?.successConfidence ?? 0.3) + crossingEvents.length * 0.08 - (warningOnly ? 0.08 : 0) - (fading ? 0.12 : 0));

  return [makeDraft({
    domain: "crossing",
    sourceKey: key ?? "crossing-events",
    title: warningOnly ? "Crossing knowledge is mostly caution" : "Crossing knowledge has practical proof",
    summary: warningOnly
      ? "The evidence points to a crossing, but the current record reads more like warning than easy use."
      : "Crossing memory marks a water negotiation that has been used before.",
    score: confidence + crossingEvents.length * 0.04,
    confidence,
    carrier: warningOnly ? "camp_group_heard" : "working_adults",
    transmission: fading ? "fading_or_uncertain" : warningOnly ? "widely_shared" : "personally_practiced",
    practicalStatus: warningOnly ? "heard_about" : fading ? "fading_uncertain" : "practical",
    memoryScope: crossingEvents.some((event) => event.memoryScope === "durable") ? "durable" : "recent",
    livedStatus: "personally_lived",
    firstKnownYear: crossing?.firstUsedAt.year,
    lastReinforcedYear: crossing?.lastUsedAt.year,
    fading,
    uncertainty: fading ? "It is remembered, but recent parties have not refreshed it." : undefined,
    evidence,
  })];
}

function buildPlaceCountryKnowledge(
  band: Band,
  events: readonly CanonicalEvent[],
  currentYear: number,
): readonly KnowledgeItemDraft[] {
  const placeRecords = Object.values(band.placeMemory)
    .sort((left, right) =>
      right.repeatedReturnCount - left.repeatedReturnCount ||
      right.attachment - left.attachment ||
      String(left.tileId).localeCompare(String(right.tileId)));
  const returnPlaces = placeRecords.filter((place) => place.isReturnPlace || place.repeatedReturnCount > 0);
  const countryEvents = events.filter((event) =>
    event.family === "knowledge_memory" ||
    event.type === "durable_episode" && /country|camp|place/i.test(`${event.title} ${event.summary}`));
  const knownTiles = Object.keys(band.knowledge.observedTiles).length;

  if (knownTiles === 0 && returnPlaces.length === 0 && countryEvents.length === 0) {
    return [];
  }

  const primary = returnPlaces[0] ?? placeRecords[0];
  const evidence: KnowledgeEvidenceRef[] = [];
  if (primary !== undefined) {
    evidence.push({
      kind: "place_memory",
      label: placeEvidenceLabel(primary, returnPlaces.length),
      sourceId: `place-memory:${String(primary.tileId)}`,
      confidence: clamp01(primary.confidence),
      scope: "recent",
      livedStatus: "personally_lived",
      tileId: primary.tileId,
      reasonIds: capReasonIds(primary.reasonIds),
    });
  }
  evidence.push(...countryEvents.slice(0, 2).map((event) => eventEvidence(event, "older country memory")));
  if (evidence.length === 0) {
    evidence.push({
      kind: "place_memory",
      label: countLabel(knownTiles, "known place", "known places"),
      sourceId: `known-country:${String(band.id)}`,
      confidence: clamp01(knownTiles / 48),
      scope: "current",
      livedStatus: "personally_lived",
      reasonIds: [],
    });
  }

  const lastYear = primary?.lastObservedAt.year;
  const fading = lastYear !== undefined && currentYear - lastYear >= 16 && countryEvents.length > 0;
  const confidence = clamp01((primary?.confidence ?? knownTiles / 50) + returnPlaces.length * 0.06 + countryEvents.length * 0.08 - (fading ? 0.12 : 0));

  return [makeDraft({
    domain: "place_country",
    sourceKey: primary === undefined ? "known-country" : String(primary.tileId),
    title: countryEvents.some((event) => /expanded|widened/i.test(`${event.title} ${event.summary}`))
      ? "Country knowledge has widened"
      : returnPlaces.length > 0
        ? "Return evidence anchors known country"
        : "Known places form a working map",
    summary: countryEvents.some((event) => /expanded|widened/i.test(`${event.title} ${event.summary}`))
      ? "Older history records wider country, while current memory carries the usable places."
      : returnPlaces.length > 0
        ? "Repeated returns make a few places stand out from surrounding known ground."
        : "Observed places give the band a local map, but few have deep attachment yet.",
    score: confidence,
    confidence,
    carrier: "whole_band",
    transmission: countryEvents.some((event) => event.memoryScope === "durable") ? "durable_memory" : "widely_shared",
    practicalStatus: fading ? "fading_uncertain" : "practical",
    memoryScope: countryEvents.some((event) => event.memoryScope === "durable") ? "durable" : "current",
    livedStatus: "personally_lived",
    firstKnownYear: primary?.firstObservedAt.year,
    lastReinforcedYear: lastYear,
    fading,
    uncertainty: fading ? "The place is part of older memory, but recent reinforcement is thin." : undefined,
    evidence,
  })];
}

function buildFoodWorkKnowledge(band: Band, events: readonly CanonicalEvent[]): readonly KnowledgeItemDraft[] {
  const foodTrips = (band.recentIntraSeasonTrips ?? []).filter((trip) =>
    trip.taskGroupType === "plant_gathering_group" ||
    trip.taskGroupType === "local_foraging_group" ||
    trip.taskGroupType === "fishing_group" ||
    trip.taskGroupType === "hunting_group" ||
    trip.taskGroupType === "plant_followup_group");
  const foodReturns = (band.activityOutcomeSummary?.returnsByResourceKind ?? []).filter((entry) =>
    entry.returnedResourceKind === "gathered_plant_food" ||
    entry.returnedResourceKind === "harvested_aquatic_food" ||
    entry.returnedResourceKind === "hunted_fauna_food" ||
    entry.returnedResourceKind === "plant_information" ||
    entry.returnedResourceKind === "food_observation_only");
  const foodEvents = events.filter((event) => event.family === "food_water_pressure");

  if (foodTrips.length === 0 && foodReturns.length === 0 && foodEvents.length === 0) {
    return [];
  }

  const primaryTrip = foodTrips.slice().sort(compareTrips)[0];
  const primaryReturn = foodReturns.slice().sort((left, right) =>
    right.count - left.count || left.returnedResourceKind.localeCompare(right.returnedResourceKind))[0];
  const evidence: KnowledgeEvidenceRef[] = [];
  if (primaryTrip !== undefined) {
    evidence.push(activityEvidence(primaryTrip, activityFoodLabel(primaryTrip)));
  }
  if (primaryReturn !== undefined) {
    evidence.push(activitySummaryEvidence(band, primaryReturn.returnedResourceKind, primaryReturn.count));
  }
  evidence.push(...foodEvents.slice(0, 2).map((event) => eventEvidence(event, "food pressure or food work event")));

  const successCount = (band.activityOutcomeSummary?.successCount ?? 0) + (band.activityOutcomeSummary?.informationCount ?? 0);
  const confidence = clamp01(0.28 + foodTrips.length * 0.06 + foodReturns.length * 0.08 + successCount * 0.03 + foodEvents.length * 0.05);
  const hasPracticalTrip = foodTrips.some((trip) =>
    trip.activityOutcome === "successful_observation" ||
    trip.activityOutcome === "target_found" ||
    trip.activityOutcome === "partial_success" ||
    trip.activityOutcome === "returned_with_information");

  return [makeDraft({
    domain: "food_work",
    sourceKey: primaryTrip === undefined ? "food-events" : `${String(primaryTrip.targetTileId)}:${primaryTrip.taskGroupType}`,
    title: hasPracticalTrip ? "Food places are activity-tested" : "Food knowledge is still tentative",
    summary: hasPracticalTrip
      ? "Recent work parties have gone out and brought back usable information about food places."
      : "The food record exists mostly as pressure or reports, not settled practical confidence.",
    score: confidence,
    confidence,
    carrier: primaryTrip === undefined ? "camp_group_heard" : "returning_activity_party",
    transmission: primaryTrip === undefined ? "widely_shared" : "heard_from_returning_party",
    practicalStatus: hasPracticalTrip ? "practical" : "heard_about",
    memoryScope: "recent",
    livedStatus: "personally_lived",
    lastReinforcedYear: tripYear(primaryTrip),
    fading: false,
    evidence,
  })];
}

function buildWaterRefugeKnowledge(band: Band, events: readonly CanonicalEvent[]): readonly KnowledgeItemDraft[] {
  const waterTrips = (band.recentIntraSeasonTrips ?? []).filter((trip) =>
    trip.taskGroupType === "water_group" ||
    trip.resourceReturn.returnedResourceKind === "water_information" ||
    trip.activityMemoryEffect.effectType === "water_reliability_refreshed");
  const waterPlaces = Object.values(band.placeMemory)
    .filter((place) => place.lastKnownWaterStress !== undefined || place.valences.includes("reliable"))
    .sort((left, right) =>
      (left.lastKnownWaterStress ?? 1) - (right.lastKnownWaterStress ?? 1) ||
      right.confidence - left.confidence ||
      String(left.tileId).localeCompare(String(right.tileId)));
  const waterEvents = events.filter((event) =>
    event.family === "food_water_pressure" && /water|refuge|dry/i.test(`${event.title} ${event.summary}`));

  if (waterTrips.length === 0 && waterPlaces.length === 0 && waterEvents.length === 0) {
    return [];
  }

  const trip = waterTrips.slice().sort(compareTrips)[0];
  const place = waterPlaces[0];
  const evidence: KnowledgeEvidenceRef[] = [];
  if (trip !== undefined) {
    evidence.push(activityEvidence(trip, waterTripEvidenceLabel(trip)));
  }
  if (place !== undefined) {
    evidence.push({
      kind: "place_memory",
      label: waterPlaceEvidenceLabel(place),
      sourceId: `water-place:${String(place.tileId)}`,
      confidence: clamp01(place.confidence),
      scope: "recent",
      livedStatus: "personally_lived",
      tileId: place.tileId,
      reasonIds: capReasonIds(place.reasonIds),
    });
  }
  evidence.push(...waterEvents.slice(0, 2).map((event) => eventEvidence(event, "water pressure event")));

  const confidence = clamp01(0.26 + waterTrips.length * 0.08 + waterPlaces.length * 0.06 + waterEvents.length * 0.06 + (place?.confidence ?? 0));

  return [makeDraft({
    domain: "water_refuge",
    sourceKey: place === undefined ? "water-activity" : String(place.tileId),
    title: "Water/refuge knowledge has direct traces",
    summary: "Water places are supported by remembered places, recent parties, or pressure records.",
    score: confidence,
    confidence,
    carrier: trip === undefined ? "whole_band" : "returning_activity_party",
    transmission: trip === undefined ? "widely_shared" : "heard_from_returning_party",
    practicalStatus: trip === undefined && waterEvents.length > 0 ? "heard_about" : "practical",
    memoryScope: waterEvents.some((event) => event.memoryScope === "durable") ? "durable" : "recent",
    livedStatus: "personally_lived",
    firstKnownYear: place?.firstObservedAt.year,
    lastReinforcedYear: place?.lastObservedAt.year ?? tripYear(trip),
    fading: false,
    evidence,
  })];
}

function buildRiskKnowledge(
  band: Band,
  events: readonly CanonicalEvent[],
  currentYear: number,
): readonly KnowledgeItemDraft[] {
  const failedTrips = (band.recentIntraSeasonTrips ?? []).filter((trip) =>
    trip.activityOutcome === "failed_due_to_distance" ||
    trip.activityOutcome === "failed_due_to_water_risk" ||
    trip.activityOutcome === "failed_due_to_low_memory_confidence" ||
    trip.activityOutcome === "failed_due_to_season_mismatch" ||
    trip.activityOutcome === "abandoned_due_to_risk" ||
    trip.activityMemoryEffect.effectType === "risk_suspicion_added");
  const hardMoves = (band.recentResidentialMoveEvents ?? []).filter((event) =>
    (event.hardshipRisk ?? 0) > 0.25 ||
    event.status === "failed_no_route");
  const riskEvents = events.filter((event) =>
    event.family === "food_water_pressure" ||
    event.family === "movement_place" && /blocked|risk|hard|fragile|burden|sick|pressure/i.test(`${event.title} ${event.summary}`));
  const highRiskCrossing = Object.values(band.crossingMemories).find((crossing) => crossing.riskMemory >= 0.5);

  if (failedTrips.length === 0 && hardMoves.length === 0 && riskEvents.length === 0 && highRiskCrossing === undefined) {
    return [];
  }

  const evidence: KnowledgeEvidenceRef[] = [];
  if (failedTrips[0] !== undefined) {
    evidence.push(activityEvidence(failedTrips[0], riskTripEvidenceLabel(failedTrips[0])));
  }
  if (hardMoves[0] !== undefined) {
    evidence.push({
      kind: "residential_move",
      label: moveRiskEvidenceLabel(hardMoves[0]),
      sourceId: `residential-move:${String(hardMoves[0].eventId)}`,
      confidence: clamp01(0.42 + (hardMoves[0].hardshipRisk ?? 0) * 0.35),
      scope: "recent",
      livedStatus: "personally_lived",
      tileId: hardMoves[0].toTileId,
      reasonIds: capReasonIds(hardMoves[0].reasonIds),
    });
  }
  if (highRiskCrossing !== undefined) {
    evidence.push({
      kind: "crossing_memory",
      label: crossingCautionLabel(highRiskCrossing),
      sourceId: `crossing-risk:${String(highRiskCrossing.crossingTileA)}:${String(highRiskCrossing.crossingTileB)}`,
      confidence: clamp01(highRiskCrossing.riskMemory),
      scope: "recent",
      livedStatus: "personally_lived",
      tileId: highRiskCrossing.crossingTileA,
      reasonIds: capReasonIds(highRiskCrossing.reasonIds),
    });
  }
  evidence.push(...riskEvents.slice(0, 2).map((event) => eventEvidence(event, "risk or pressure event")));

  const oldestRiskEvent = riskEvents.slice().sort((left, right) => left.startYear - right.startYear)[0];
  const fading = oldestRiskEvent !== undefined && currentYear - oldestRiskEvent.endYear >= 18 && failedTrips.length === 0;
  const confidence = clamp01(0.3 + failedTrips.length * 0.07 + hardMoves.length * 0.08 + riskEvents.length * 0.05 + (highRiskCrossing?.riskMemory ?? 0) * 0.2 - (fading ? 0.12 : 0));

  return [makeDraft({
    domain: "risk_caution",
    sourceKey: failedTrips[0] === undefined ? "risk-events" : `${String(failedTrips[0].targetTileId)}:${failedTrips[0].activityOutcome}`,
    title: fading ? "Warning evidence is old and thin" : "Caution has remembered causes",
    summary: fading
      ? "The warning is preserved as older memory, but recent parties have not refreshed it."
      : "Blocked trips, hard movement, pressure, or risky crossings keep caution grounded in evidence.",
    score: confidence,
    confidence,
    carrier: failedTrips.length > 0 ? "returning_activity_party" : "camp_group_heard",
    transmission: failedTrips.length > 0 ? "heard_from_returning_party" : "durable_memory",
    practicalStatus: fading ? "fading_uncertain" : "heard_about",
    memoryScope: riskEvents.some((event) => event.memoryScope === "durable") ? "durable" : "recent",
    livedStatus: "personally_lived",
    lastReinforcedYear: failedTrips[0] === undefined ? riskEvents[0]?.endYear : tripYear(failedTrips[0]),
    fading,
    uncertainty: fading ? "It should read as caution, not mastered risk knowledge." : undefined,
    evidence,
  })];
}

function buildSocialKnowledge(band: Band): readonly KnowledgeItemDraft[] {
  const contacts = Object.values(band.contactMemories);
  const reports = band.reportedKnowledge?.reports ?? [];
  if (contacts.length === 0 && reports.length === 0) {
    return [];
  }

  const evidence: KnowledgeEvidenceRef[] = [];
  if (contacts[0] !== undefined) {
    evidence.push({
      kind: "reported_knowledge",
      label: countLabel(contacts.length, "known neighboring band", "known neighboring bands"),
      sourceId: `contact:${String(contacts[0].otherBandId)}`,
      confidence: clamp01(contacts[0].familiarity),
      scope: "current",
      livedStatus: "personally_lived",
      reasonIds: capReasonIds(contacts[0].reasonIds),
    });
  }
  if (reports[0] !== undefined) {
    evidence.push({
      kind: "reported_knowledge",
      label: reportEvidenceLabel(reports[0], reports.length),
      sourceId: String(reports[0].reportId),
      confidence: clamp01(reports[0].confidence),
      scope: "recent",
      livedStatus: "personally_lived",
      tileId: reports[0].targetTileId,
      reasonIds: capReasonIds(reports[0].reasonIds),
    });
  }

  return [makeDraft({
    domain: "social_contact",
    sourceKey: contacts[0] === undefined ? "reported-knowledge" : String(contacts[0].otherBandId),
    title: reports.length > contacts.length ? "Camp-heard reports are kept separate" : "Other people are part of what is known",
    summary: reports.length > contacts.length
      ? "Reports add hearsay context, but the panel keeps them distinct from direct proof."
      : "Contact and reports can carry knowledge, but they stay separate from direct proof.",
    score: clamp01(0.34 + contacts.length * 0.08 + reports.length * 0.04),
    confidence: clamp01(0.3 + contacts.length * 0.08 + reports.length * 0.03),
    carrier: "camp_group_heard",
    transmission: "heard_from_returning_party",
    practicalStatus: "heard_about",
    memoryScope: "recent",
    livedStatus: "personally_lived",
    fading: false,
    evidence,
  })];
}

function buildInheritedKnowledge(
  band: Band,
  events: readonly CanonicalEvent[],
  currentYear: number,
): readonly KnowledgeItemDraft[] {
  const history = band.deepHistory;
  const inheritedEvents = events.filter((event) =>
    event.memoryScope === "inherited" || event.livedStatus === "inherited_not_personally_lived");

  if (
    history === undefined ||
    history.founding.kind !== "fission_daughter" && inheritedEvents.length === 0 &&
      history.inheritedEraSummaries.length === 0 && history.inheritedEpisodes.length === 0
  ) {
    return [];
  }

  const evidence: KnowledgeEvidenceRef[] = [];
  if (history.founding.parentBandId !== undefined) {
    evidence.push({
      kind: "founding_snapshot",
      label: "daughter founded with parent memory",
      sourceId: `founding:${String(history.bandId)}:${history.founding.foundedAt.year}`,
      confidence: 0.58,
      scope: "inherited",
      livedStatus: "inherited_not_personally_lived",
      chronicleLinkId: `year:${history.founding.foundedAt.year}`,
      reasonIds: capReasonIds(history.founding.creationReasonIds),
    });
  }
  evidence.push(...inheritedEvents.slice(0, 2).map((event) => eventEvidence(event, "inherited event memory")));
  const inheritedEra = history.inheritedEraSummaries[0];
  if (inheritedEra !== undefined) {
    evidence.push({
      kind: "deep_history",
      label: "parent era carried forward",
      sourceId: `inherited-era:${String(inheritedEra.sourceBandId)}:${inheritedEra.startYear}-${inheritedEra.endYear}`,
      confidence: 0.48,
      scope: "inherited",
      livedStatus: "inherited_not_personally_lived",
      chronicleLinkId: "article-long-memory",
      reasonIds: [],
    });
  }

  const daughterAge = Math.max(0, currentYear - history.founding.foundedAt.year);
  const locallyReinforced = events.some((event) => event.memoryScope !== "inherited" && event.startYear >= history.founding.foundedAt.year);
  const inheritedOnly = !locallyReinforced;
  const fading = daughterAge >= 20 && inheritedOnly;
  const confidence = clamp01(0.44 + inheritedEvents.length * 0.04 + history.inheritedEraSummaries.length * 0.04 - (fading ? 0.16 : 0));

  return [makeDraft({
    domain: "inherited_memory",
    sourceKey: history.founding.parentBandId === undefined ? "inherited-history" : String(history.founding.parentBandId),
    title: locallyReinforced ? "Parent memory has been reinforced here" : "Parent memory is carried, not fully practiced",
    summary: locallyReinforced
      ? "Some inherited knowledge has met this band's own later experience."
      : "This is lineage memory from founding, not proof that the daughter personally lived it.",
    score: confidence,
    confidence,
    carrier: "daughter_inherited_memory",
    transmission: "inherited_story",
    practicalStatus: locallyReinforced ? "heard_about" : fading ? "fading_uncertain" : "inherited_not_practiced",
    memoryScope: "inherited",
    livedStatus: "inherited_not_personally_lived",
    firstKnownYear: history.founding.foundedAt.year,
    fading,
    uncertainty: fading ? "It persists as parent memory but has not been practiced enough here." : "Inherited knowledge is not the same as local practice.",
    evidence,
  })];
}

function makeDraft(input: {
  readonly domain: KnowledgeEcologyDomain;
  readonly sourceKey: string;
  readonly title: string;
  readonly summary: string;
  readonly score: number;
  readonly confidence: number;
  readonly carrier: KnowledgeCarrierCategory;
  readonly transmission: KnowledgeTransmissionStatus;
  readonly practicalStatus: KnowledgePracticalStatus;
  readonly memoryScope: KnowledgeMemoryScope;
  readonly livedStatus: KnowledgeLivedStatus;
  readonly firstKnownYear?: number;
  readonly lastReinforcedYear?: number;
  readonly fading: boolean;
  readonly uncertainty?: string;
  readonly evidence: readonly KnowledgeEvidenceRef[];
}): KnowledgeItemDraft {
  return {
    ...input,
    evidence: capEvidence(input.evidence),
  };
}

function finalizeItem(band: Band, draft: KnowledgeItemDraft): KnowledgeEcologyItem {
  const evidence = capEvidence(draft.evidence);
  const relatedEventIds = capStrings(evidence.flatMap((entry) => entry.eventId === undefined ? [] : [entry.eventId]), LINK_PER_ITEM_CAP);
  const relatedChronicleLinkIds = capStrings(evidence.flatMap((entry) => entry.chronicleLinkId === undefined ? [] : [entry.chronicleLinkId]), LINK_PER_ITEM_CAP);
  const involvedTileIds = capTiles(evidence.flatMap((entry) => entry.tileId === undefined ? [] : [entry.tileId]), LINK_PER_ITEM_CAP);
  const involvedRouteIds = capRoutes(evidence.flatMap((entry) => entry.routeId === undefined ? [] : [entry.routeId]), LINK_PER_ITEM_CAP);

  return {
    id: `knowledge:${String(band.id)}:${draft.domain}:${slug(draft.sourceKey)}`,
    domain: draft.domain,
    title: draft.title,
    summary: draft.summary,
    confidence: round2(clamp01(draft.confidence)),
    confidenceBand: confidenceBandFor(draft),
    carrier: draft.carrier,
    transmission: draft.transmission,
    practicalStatus: draft.practicalStatus,
    memoryScope: draft.memoryScope,
    livedStatus: draft.livedStatus,
    firstKnownYear: draft.firstKnownYear,
    lastReinforcedYear: draft.lastReinforcedYear,
    fading: draft.fading,
    uncertainty: draft.uncertainty,
    evidence,
    relatedEventIds,
    relatedChronicleLinkIds,
    involvedTileIds,
    involvedRouteIds,
  };
}

function eventEvidence(event: CanonicalEvent, label: string): KnowledgeEvidenceRef {
  return {
    kind: "canonical_event",
    label,
    sourceId: event.id,
    confidence: clamp01(event.significance),
    scope: event.memoryScope,
    livedStatus: event.livedStatus,
    eventId: event.id,
    chronicleLinkId: event.chronicleLinkIds[0],
    tileId: event.involvedTileIds[0],
    routeId: event.involvedRouteIds[0],
    reasonIds: capReasonIds(event.sourceReasonIds),
  };
}

function activityEvidence(trip: IntraSeasonTripRecord, label: string): KnowledgeEvidenceRef {
  return {
    kind: "activity_trip",
    label,
    sourceId: `activity:${String(trip.sourceBandId)}:${Number(trip.tick)}:${String(trip.targetTileId)}:${trip.taskGroupType}`,
    confidence: clamp01(0.34 + trip.estimatedPeopleCount * 0.03 + activityOutcomeConfidence(trip.activityOutcome)),
    scope: "recent",
    livedStatus: "personally_lived",
    tileId: trip.targetTileId,
    reasonIds: capReasonIds([...trip.reasonIds, ...trip.activityOutcomeReasonIds, ...trip.activityMemoryEffect.reasonIds]),
  };
}

function activitySummaryEvidence(
  band: Band,
  returnedResourceKind: ActivityReturnResourceKind,
  count: number,
): KnowledgeEvidenceRef {
  return {
    kind: "activity_summary",
    label: activityReturnLabel(returnedResourceKind, count),
    sourceId: `activity-summary:${String(band.id)}:${returnedResourceKind}`,
    confidence: clamp01(0.34 + count * 0.08),
    scope: "recent",
    livedStatus: "personally_lived",
    reasonIds: [],
  };
}

function recentTripsByTask(
  band: Band,
  taskTypes: readonly IntraSeasonTripTaskGroupType[],
): readonly IntraSeasonTripRecord[] {
  const allowed = new Set(taskTypes);
  return (band.recentIntraSeasonTrips ?? [])
    .filter((trip) => allowed.has(trip.taskGroupType))
    .sort(compareTrips);
}

function capKnowledgeItems(drafts: readonly KnowledgeItemDraft[]): readonly KnowledgeItemDraft[] {
  const sorted = drafts
    .filter((draft) => draft.evidence.length > 0)
    .sort((left, right) =>
      right.score - left.score ||
      domainOrder(left.domain) - domainOrder(right.domain) ||
      left.title.localeCompare(right.title) ||
      left.sourceKey.localeCompare(right.sourceKey));
  const perDomain = { ...EMPTY_DOMAIN_COUNTS };
  const result: KnowledgeItemDraft[] = [];
  const seen = new Set<string>();

  for (const draft of sorted) {
    const key = `${draft.domain}:${draft.sourceKey}`;
    if (seen.has(key) || perDomain[draft.domain] >= PER_DOMAIN_CAP) {
      continue;
    }
    seen.add(key);
    perDomain[draft.domain] += 1;
    result.push(draft);
    if (result.length >= KNOWLEDGE_ITEM_CAP) {
      break;
    }
  }

  return result.sort((left, right) =>
    domainOrder(left.domain) - domainOrder(right.domain) ||
    confidenceBandRank(confidenceBandFor(right)) - confidenceBandRank(confidenceBandFor(left)) ||
    right.confidence - left.confidence ||
    left.title.localeCompare(right.title));
}

function capEvidence(evidence: readonly KnowledgeEvidenceRef[]): readonly KnowledgeEvidenceRef[] {
  const sorted = evidence
    .filter((entry) => entry.label.length > 0)
    .sort((left, right) =>
      scopeRank(right.scope) - scopeRank(left.scope) ||
      right.confidence - left.confidence ||
      evidenceKindRank(left.kind) - evidenceKindRank(right.kind) ||
      left.label.localeCompare(right.label));
  const seen = new Set<string>();
  const result: KnowledgeEvidenceRef[] = [];

  for (const entry of sorted) {
    const key = `${entry.kind}:${entry.label}:${entry.sourceId}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push({
      ...entry,
      confidence: round2(clamp01(entry.confidence)),
      reasonIds: capReasonIds(entry.reasonIds),
    });
    if (result.length >= EVIDENCE_PER_ITEM_CAP) {
      break;
    }
  }

  return result;
}

function overviewTitle(items: readonly KnowledgeEcologyItem[]): string {
  const first = items[0];
  if (first === undefined) {
    return "Knowledge is still thin";
  }
  switch (first.domain) {
    case "route_corridor":
      return "They know by moving through routes";
    case "crossing":
      return "Crossings shape what they know";
    case "place_country":
      return "Their knowledge is tied to country";
    case "food_work":
      return "Food work is teaching the band";
    case "water_refuge":
      return "Water and refuge are remembered";
    case "risk_caution":
      return "Caution is part of their knowledge";
    case "social_contact":
      return "Reports and contact carry some knowledge";
    case "inherited_memory":
      return "Parent memory still matters";
  }
}

function overviewLines(items: readonly KnowledgeEcologyItem[]): readonly string[] {
  if (items.length === 0) {
    return ["No strong knowledge ecology profile is visible yet."];
  }
  const practical = items.filter((item) => item.practicalStatus === "practical").length;
  const inherited = items.filter((item) => item.livedStatus === "inherited_not_personally_lived").length;
  const fading = items.filter((item) => item.fading || item.practicalStatus === "fading_uncertain").length;
  const activity = items.filter((item) => item.evidence.some((entry) => entry.kind === "activity_trip" || entry.kind === "activity_summary")).length;
  const lines = [
    practical > 0
      ? practical === 1
        ? "one item is practical knowledge, reinforced by use or direct memory."
        : `${countWord(practical)} items are practical knowledge, reinforced by use or direct memory.`
      : "Most visible knowledge is still heard, inherited, or weak rather than fully practical.",
  ];
  if (activity > 0) {
    lines.push("Returning activity parties are part of how recent knowledge spreads through camp.");
  }
  if (inherited > 0) {
    lines.push("Inherited memory is kept separate from what this band has personally practiced.");
  }
  if (fading > 0) {
    lines.push("Some knowledge is marked as fading or uncertain instead of treated as perfect memory.");
  }
  return lines.slice(0, 3);
}

function confidenceBandFor(item: Pick<KnowledgeItemDraft, "confidence" | "memoryScope" | "livedStatus" | "fading">): KnowledgeConfidenceBand {
  if (item.fading) {
    return "fading";
  }
  if (item.livedStatus === "inherited_not_personally_lived") {
    return "inherited";
  }
  if (item.memoryScope === "durable") {
    return "durable";
  }
  if (item.confidence >= 0.68) {
    return "reliable";
  }
  if (item.confidence >= 0.38) {
    return "forming";
  }
  return "faint";
}

function countDomains(items: readonly KnowledgeEcologyItem[]): Readonly<Record<KnowledgeEcologyDomain, number>> {
  const counts = { ...EMPTY_DOMAIN_COUNTS };
  for (const item of items) {
    counts[item.domain] += 1;
  }
  return counts;
}

function countCarriers(items: readonly KnowledgeEcologyItem[]): Readonly<Record<KnowledgeCarrierCategory, number>> {
  const counts = { ...EMPTY_CARRIER_COUNTS };
  for (const item of items) {
    counts[item.carrier] += 1;
  }
  return counts;
}

function countEvidenceKinds(evidence: readonly KnowledgeEvidenceRef[]): Readonly<Record<KnowledgeEvidenceKind, number>> {
  const counts = { ...EMPTY_EVIDENCE_COUNTS };
  for (const entry of evidence) {
    counts[entry.kind] += 1;
  }
  return counts;
}

function activityOutcomeConfidence(outcome: string): number {
  switch (outcome) {
    case "successful_observation":
    case "target_found":
      return 0.24;
    case "partial_success":
    case "returned_with_information":
      return 0.18;
    case "target_not_found":
    case "no_effect_observed":
      return 0.08;
    default:
      return 0.02;
  }
}

function activityFoodLabel(trip: IntraSeasonTripRecord): string {
  const target = tripTargetPhrase(trip);
  switch (trip.taskGroupType) {
    case "fishing_group":
      return `fishing party worked ${target}`;
    case "hunting_group":
      return `hunting party worked ${target}`;
    case "plant_followup_group":
      return `plant follow-up checked ${target}`;
    case "plant_gathering_group":
    case "local_foraging_group":
      return `gathering party worked ${target}`;
    case "water_group":
    case "memory_refresh_group":
      return `activity party brought back food context from ${target}`;
  }
}

function activityReturnLabel(kind: ActivityReturnResourceKind, count: number): string {
  const times = timesLabel(count);
  switch (kind) {
    case "gathered_plant_food":
      return `gathered food returned ${times}`;
    case "harvested_aquatic_food":
      return `fish returned ${times}`;
    case "hunted_fauna_food":
      return `hunting returned ${times}`;
    case "plant_information":
      return `plant information returned ${times}`;
    case "food_observation_only":
      return `food place observed ${times}`;
    case "water_information":
      return `water information returned ${times}`;
    case "route_information":
      return `route information returned ${times}`;
    case "none":
      return "no return recorded";
  }
}

function routeEvidence(route: TravelCorridorMemory, currentYear: number): KnowledgeEvidenceRef {
  const ageYears = Math.max(0, currentYear - route.lastUsedAt.year);
  return {
    kind: "route_memory",
    label: routeEvidenceLabel(route, ageYears),
    sourceId: `route:${String(route.id)}`,
    confidence: clamp01(route.confidence),
    scope: ageYears >= 12 ? "durable" : "recent",
    livedStatus: "personally_lived",
    tileId: route.toTileId,
    routeId: route.id,
    reasonIds: [],
  };
}

function routeEvidenceLabel(route: TravelCorridorMemory, ageYears: number): string {
  const direction = directionBetweenTileIds(route.fromTileId, route.toTileId);
  const uses = countLabel(route.useCount, "use", "uses");
  if (ageYears >= 12) {
    return `${direction} corridor, ${uses}, last used ${ageYears}y ago`;
  }
  return `${direction} corridor, ${uses}`;
}

function routeTripEvidenceLabel(trip: IntraSeasonTripRecord): string {
  return `route party returned from ${tripTargetPhrase(trip)}`;
}

function waterTripEvidenceLabel(trip: IntraSeasonTripRecord): string {
  return `water party checked ${tripTargetPhrase(trip)}`;
}

function riskTripEvidenceLabel(trip: IntraSeasonTripRecord): string {
  const target = tripTargetPhrase(trip);
  switch (trip.activityOutcome) {
    case "failed_due_to_water_risk":
      return `${target} water trip turned back`;
    case "abandoned_due_to_risk":
      return `${target} trip abandoned`;
    case "failed_due_to_distance":
      return `${target} party failed by distance`;
    case "failed_due_to_low_memory_confidence":
      return `${target} party lacked route proof`;
    case "failed_due_to_season_mismatch":
      return `${target} season mismatch`;
    default:
      return `${target} party met a limit`;
  }
}

function moveRiskEvidenceLabel(move: NonNullable<Band["recentResidentialMoveEvents"]>[number]): string {
  const direction = directionBetweenTileIds(move.fromTileId, move.toTileId);
  if (move.status === "failed_no_route") {
    return `blocked ${direction} move`;
  }
  if (move.hardshipOutcome === "rejected") {
    return `${direction} move rejected`;
  }
  return `${direction} hard move`;
}

function placeEvidenceLabel(place: Band["placeMemory"][TileId], returnPlaceCount: number): string {
  if (place.repeatedReturnCount > 0) {
    return countLabel(place.repeatedReturnCount, "recent return", "recent returns");
  }
  if (returnPlaceCount > 1) {
    return countLabel(returnPlaceCount, "return place", "return places");
  }
  if (place.visitCount > 1) {
    return countLabel(place.visitCount, "recorded visit", "recorded visits");
  }
  return "known place remembered";
}

function waterPlaceEvidenceLabel(place: Band["placeMemory"][TileId]): string {
  if (place.valences.includes("reliable")) {
    return "reliable water/refuge place";
  }
  if ((place.lastKnownWaterStress ?? 1) <= 0.3) {
    return "low-water-stress place";
  }
  if ((place.lastKnownWaterStress ?? 0) >= 0.55) {
    return "water-stress place remembered";
  }
  return "water/refuge place remembered";
}

function crossingEvidenceLabel(crossing: Band["crossingMemories"][string]): string {
  const direction = directionBetweenTileIds(crossing.crossingTileA, crossing.crossingTileB);
  const uses = countLabel(crossing.useCount, "use", "uses");
  if (crossing.riskMemory >= 0.5 && crossing.successConfidence < 0.45) {
    return `risky ${direction} crossing, ${uses}`;
  }
  if (crossing.riskMemory >= 0.5) {
    return `${direction} crossing, risky`;
  }
  return `${direction} crossing, ${uses}`;
}

function crossingCautionLabel(crossing: Band["crossingMemories"][string]): string {
  const direction = directionBetweenTileIds(crossing.crossingTileA, crossing.crossingTileB);
  return `risky ${direction} crossing`;
}

function reportEvidenceLabel(
  report: NonNullable<Band["reportedKnowledge"]>["reports"][number],
  reportCount: number,
): string {
  if (reportCount > 1) {
    return countLabel(reportCount, "camp-heard report", "camp-heard reports");
  }
  return `camp-heard ${report.topic.replace(/_/g, " ")}`;
}

function tripTargetPhrase(trip: IntraSeasonTripRecord): string {
  const direction = directionBetweenTileIds(trip.originTileId, trip.targetTileId);
  return direction === "local" ? "near camp" : `${direction} of camp`;
}

function directionBetweenTileIds(fromTileId: TileId, toTileId: TileId): string {
  const from = parseTileCoord(fromTileId);
  const to = parseTileCoord(toTileId);
  if (from === undefined || to === undefined) {
    return "known";
  }
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) {
    return "local";
  }
  const horizontal = dx < 0 ? "west" : dx > 0 ? "east" : "";
  const vertical = dy < 0 ? "north" : dy > 0 ? "south" : "";
  if (vertical.length > 0 && horizontal.length > 0) {
    return `${vertical}-${horizontal}`;
  }
  return vertical || horizontal || "known";
}

function parseTileCoord(tileId: TileId): Coord | undefined {
  const [, rawX, rawY] = String(tileId).split(":");
  const x = Number(rawX);
  const y = Number(rawY);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : undefined;
}

function tripYear(trip: IntraSeasonTripRecord | undefined): number | undefined {
  if (trip === undefined) {
    return undefined;
  }
  return Math.floor(Number(trip.tick) / 4);
}

function compareTrips(left: IntraSeasonTripRecord, right: IntraSeasonTripRecord): number {
  return Number(right.tick) - Number(left.tick) ||
    Number(right.day) - Number(left.day) ||
    String(left.targetTileId).localeCompare(String(right.targetTileId)) ||
    left.taskGroupType.localeCompare(right.taskGroupType);
}

function compareCorridors(left: TravelCorridorMemory, right: TravelCorridorMemory): number {
  return right.useCount - left.useCount ||
    right.confidence - left.confidence ||
    Number(right.lastUsedAt.tick) - Number(left.lastUsedAt.tick) ||
    String(left.id).localeCompare(String(right.id));
}

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function countWord(count: number): string {
  if (count <= 1) return "one";
  if (count === 2) return "two";
  if (count === 3) return "three";
  return "several";
}

function timesLabel(count: number): string {
  if (count <= 1) return "once";
  if (count === 2) return "twice";
  return `${count} times`;
}

function capReasonIds(reasonIds: readonly ReasonId[] | undefined): readonly ReasonId[] {
  return [...(reasonIds ?? [])]
    .sort((left, right) => String(left).localeCompare(String(right)))
    .slice(0, LINK_PER_ITEM_CAP);
}

function capStrings(values: readonly string[], cap: number): readonly string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (seen.has(value)) {
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

function capTiles(values: readonly TileId[], cap: number): readonly TileId[] {
  const seen = new Set<string>();
  const result: TileId[] = [];
  for (const value of values) {
    if (seen.has(String(value))) {
      continue;
    }
    seen.add(String(value));
    result.push(value);
    if (result.length >= cap) {
      break;
    }
  }
  return result;
}

function capRoutes(values: readonly RouteId[], cap: number): readonly RouteId[] {
  const seen = new Set<string>();
  const result: RouteId[] = [];
  for (const value of values) {
    if (seen.has(String(value))) {
      continue;
    }
    seen.add(String(value));
    result.push(value);
    if (result.length >= cap) {
      break;
    }
  }
  return result;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 64) || "item";
}

function domainOrder(domain: KnowledgeEcologyDomain): number {
  return DOMAIN_ORDER.indexOf(domain);
}

function scopeRank(scope: KnowledgeMemoryScope): number {
  switch (scope) {
    case "current":
      return 4;
    case "recent":
      return 3;
    case "durable":
      return 2;
    case "inherited":
      return 1;
  }
}

function evidenceKindRank(kind: KnowledgeEvidenceKind): number {
  switch (kind) {
    case "activity_trip":
      return 0;
    case "activity_summary":
      return 1;
    case "canonical_event":
      return 2;
    case "place_memory":
      return 3;
    case "route_memory":
      return 4;
    case "crossing_memory":
      return 5;
    case "deep_history":
      return 6;
    case "founding_snapshot":
      return 7;
    case "reported_knowledge":
      return 8;
    case "demography":
      return 9;
    case "residential_move":
      return 10;
  }
}

function confidenceBandRank(band: KnowledgeConfidenceBand): number {
  switch (band) {
    case "reliable":
      return 6;
    case "durable":
      return 5;
    case "inherited":
      return 4;
    case "forming":
      return 3;
    case "fading":
      return 2;
    case "faint":
      return 1;
  }
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function byteLengthUtf8(value: string): number {
  return new TextEncoder().encode(value).length;
}
