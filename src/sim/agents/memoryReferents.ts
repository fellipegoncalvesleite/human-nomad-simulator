import type { BandId, EventId, ReasonId, RouteId, Season, TickNumber, TileId } from "../core/types";
import type { WorldState } from "../world/types";
import type {
  Band,
  CampRumorReadabilityItem,
  CampTalkRepetitionRecord,
  MaterialWearRecord,
  ProtoAccessMemory,
  ProtoCampPlaceMemory,
  ResidentialMoveEvent,
  SicknessWaveState,
  TravelCorridorMemory,
  WeatherMemoryRecord,
} from "./types";

const TOTAL_REFERENT_CAP = 40;
const PER_KIND_CAP = 6;
const RELATED_ID_CAP = 6;
const PROOF_ID_CAP = 8;
const TECHNICAL_PROOF_CAP = 24;

export type MemoryReferentKind =
  | "weather_episode"
  | "food_patch"
  | "resource_place"
  | "animal_sign"
  | "aquatic_place"
  | "forest_place"
  | "camp_place"
  | "route"
  | "crossing"
  | "accident"
  | "sickness_source"
  | "gear_material_issue"
  | "access_place"
  | "talk_source"
  | "event_source"
  | "social_relation";

export type MemoryReferentFreshness = "current" | "recent" | "repeated" | "stale" | "recovering" | "worsening" | "uncertain";

export type MemoryReferentTab =
  | "overview"
  | "doing"
  | "survival"
  | "food"
  | "nature"
  | "place"
  | "people"
  | "chronicle";

export interface MemoryReferentTechnicalProof {
  readonly rawSourceLabels: readonly string[];
  readonly rawIds: readonly string[];
  readonly sourceReasonIds: readonly ReasonId[];
  readonly sourceEventIds: readonly EventId[];
  readonly sourceTalkIds: readonly string[];
  readonly score: number;
  readonly scoringReasons: readonly string[];
  readonly sourceKind: MemoryReferentKind;
}

export interface MemoryReferent {
  readonly id: string;
  readonly kind: MemoryReferentKind;
  readonly title: string;
  readonly shortLabel: string;
  readonly summary: string;
  readonly placeLabel?: string;
  readonly year?: number;
  readonly season?: Season;
  readonly firstSeen?: string;
  readonly lastSeen?: string;
  readonly recurrence?: string;
  readonly confidenceWord: string;
  readonly freshness: MemoryReferentFreshness;
  readonly status: string;
  readonly currentResponse: string;
  readonly consequences: readonly string[];
  readonly relatedEventIds: readonly EventId[];
  readonly relatedTalkIds: readonly string[];
  readonly relatedPlaceIds: readonly TileId[];
  readonly relatedResourceIds: readonly string[];
  readonly relatedRouteIds: readonly RouteId[];
  readonly relatedBandIds: readonly BandId[];
  readonly relatedReadableSources: readonly string[];
  readonly sourceTabs: readonly MemoryReferentTab[];
  readonly linkTargetId: string;
  readonly score: number;
  readonly technicalProof: MemoryReferentTechnicalProof;
}

export interface MemoryReferentTechnicalSummary {
  readonly selectedBandOnly: true;
  readonly payloadBytesEstimate: number;
  readonly sourceCounts: {
    readonly weatherMemories: number;
    readonly materialWear: number;
    readonly fallbackCandidates: number;
    readonly resourcePlaceMemories: number;
    readonly visibleNatureCards: number;
    readonly acuteRiskEpisodes: number;
    readonly campPlaces: number;
    readonly accessPlaces: number;
    readonly routes: number;
    readonly crossings: number;
    readonly talkItems: number;
    readonly events: number;
  };
  readonly proof: readonly MemoryReferentTechnicalProof[];
}

export interface MemoryReferentState {
  readonly bandId: BandId;
  readonly generatedAtTick: TickNumber;
  readonly generatedAtYear: number;
  readonly generatedAtSeason: Season;
  readonly referents: readonly MemoryReferent[];
  readonly linkTargets: readonly {
    readonly id: string;
    readonly referentId: string;
    readonly label: string;
    readonly kind: MemoryReferentKind;
  }[];
  readonly byKindCounts: Readonly<Record<MemoryReferentKind, number>>;
  readonly compressedNotices: readonly string[];
  readonly caps: {
    readonly totalReferentCap: number;
    readonly perKindCap: number;
    readonly relatedIdCap: number;
    readonly proofIdCap: number;
    readonly technicalProofCap: number;
    readonly droppedByTotalCap: number;
    readonly droppedByKindCap: number;
  };
  readonly antiOmniscience: {
    readonly selectedBandOnly: true;
    readonly fromBandKnownInputsOnly: true;
    readonly hiddenMapTruthUsed: false;
    readonly hiddenBandTruthUsed: false;
    readonly noReligionMythCulture: true;
    readonly noNamedPeople: true;
    readonly noSettlementWarAgriculture: true;
  };
  readonly technicalProof: MemoryReferentTechnicalSummary;
}

interface ReferentDraft {
  readonly id: string;
  readonly kind: MemoryReferentKind;
  readonly title: string;
  readonly shortLabel: string;
  readonly summary: string;
  readonly placeLabel?: string;
  readonly year?: number;
  readonly season?: Season;
  readonly firstSeen?: string;
  readonly lastSeen?: string;
  readonly recurrence?: string;
  readonly confidence: number;
  readonly freshness: MemoryReferentFreshness;
  readonly status: string;
  readonly currentResponse?: string;
  readonly consequences?: readonly string[];
  readonly relatedEventIds?: readonly EventId[];
  readonly relatedTalkIds?: readonly string[];
  readonly relatedPlaceIds?: readonly TileId[];
  readonly relatedResourceIds?: readonly string[];
  readonly relatedRouteIds?: readonly RouteId[];
  readonly relatedBandIds?: readonly BandId[];
  readonly relatedReadableSources?: readonly string[];
  readonly sourceTabs: readonly MemoryReferentTab[];
  readonly score: number;
  readonly rawSourceLabels: readonly string[];
  readonly rawIds?: readonly string[];
  readonly sourceReasonIds?: readonly ReasonId[];
  readonly scoringReasons: readonly string[];
}

interface ReferentContext {
  readonly world: WorldState;
  readonly band: Band;
}

const EMPTY_KIND_COUNTS: Readonly<Record<MemoryReferentKind, number>> = {
  weather_episode: 0,
  food_patch: 0,
  resource_place: 0,
  animal_sign: 0,
  aquatic_place: 0,
  forest_place: 0,
  camp_place: 0,
  route: 0,
  crossing: 0,
  accident: 0,
  sickness_source: 0,
  gear_material_issue: 0,
  access_place: 0,
  talk_source: 0,
  event_source: 0,
  social_relation: 0,
};

export function deriveMemoryReferents(world: WorldState, band: Band): MemoryReferentState {
  const context: ReferentContext = { world, band };
  const drafts = [
    ...deriveWeatherReferents(context),
    ...deriveGearReferents(context),
    ...deriveSicknessReferents(context),
    ...deriveFoodResourceReferents(context),
    ...deriveNatureReferents(context),
    ...deriveAccidentReferents(context),
    ...derivePlaceReferents(context),
    ...deriveRouteReferents(context),
    ...deriveAccessReferents(context),
    ...deriveSocialReferents(context),
    ...deriveTalkReferents(context),
    ...deriveEventReferents(context),
  ];
  const deduped = [...dedupeDrafts(drafts)].sort(compareDrafts);
  const capped = capDrafts(deduped);
  const referents = capped.kept.map(materializeReferent);
  const byKindCounts = countByKind(referents);
  const compressedNotices = buildCompressedNotices(band, referents);
  const payloadBytesEstimate = byteLengthUtf8(JSON.stringify({
    bandId: band.id,
    referents,
    byKindCounts,
    compressedNotices,
  }));

  return {
    bandId: band.id,
    generatedAtTick: world.time.tick,
    generatedAtYear: world.time.year,
    generatedAtSeason: world.time.season,
    referents,
    linkTargets: referents.map((referent) => ({
      id: referent.linkTargetId,
      referentId: referent.id,
      label: referent.shortLabel,
      kind: referent.kind,
    })),
    byKindCounts,
    compressedNotices,
    caps: {
      totalReferentCap: TOTAL_REFERENT_CAP,
      perKindCap: PER_KIND_CAP,
      relatedIdCap: RELATED_ID_CAP,
      proofIdCap: PROOF_ID_CAP,
      technicalProofCap: TECHNICAL_PROOF_CAP,
      droppedByTotalCap: capped.droppedByTotalCap,
      droppedByKindCap: capped.droppedByKindCap,
    },
    antiOmniscience: {
      selectedBandOnly: true,
      fromBandKnownInputsOnly: true,
      hiddenMapTruthUsed: false,
      hiddenBandTruthUsed: false,
      noReligionMythCulture: true,
      noNamedPeople: true,
      noSettlementWarAgriculture: true,
    },
    technicalProof: {
      selectedBandOnly: true,
      payloadBytesEstimate,
      sourceCounts: {
        weatherMemories: band.bodyCampLogistics?.weatherMemories.length ?? 0,
        materialWear: band.bodyCampLogistics?.materialWear.length ?? 0,
        fallbackCandidates: band.foragingAdaptation?.fallbackCandidates.length ?? 0,
        resourcePlaceMemories: band.resourceEcology?.topResourcePlaceMemories.length ?? 0,
        visibleNatureCards:
          (band.visibleNature?.faunaCards.length ?? 0) +
          (band.visibleNature?.aquaticCards.length ?? 0) +
          (band.visibleNature?.plantCards.length ?? 0) +
          (band.visibleNature?.forestCards.length ?? 0),
        acuteRiskEpisodes: band.acuteRisk?.recentEpisodes.length ?? 0,
        campPlaces: band.protoCampMemory?.topPlaces.length ?? 0,
        accessPlaces: band.protoAccessMemory?.topPlaces.length ?? 0,
        routes: Object.keys(band.travelCorridors).length + (band.relationshipMemory?.routeFamiliarity.length ?? 0),
        crossings: Object.keys(band.crossingMemories).length,
        talkItems: band.campRumors?.items.length ?? 0,
        events: band.eventHistory?.recentEvents.length ?? 0,
      },
      proof: referents.map((referent) => referent.technicalProof).slice(0, TECHNICAL_PROOF_CAP),
    },
  };
}

function deriveWeatherReferents(context: ReferentContext): readonly ReferentDraft[] {
  const { band, world } = context;
  const logistics = band.bodyCampLogistics;
  if (logistics === undefined) {
    return [];
  }

  return logistics.weatherMemories.slice(0, 6).map((memory) => {
    const response = responseForWeather(memory, band);
    const title = `${capitalize(world.time.season)} Y${world.time.year} ${weatherTitle(memory.kind, band)}`;
    const place = weatherPlaceLabel(context, memory);
    const effects = weatherEffects(memory);
    return {
      id: `weather:${String(band.id)}:${memory.kind}`,
      kind: "weather_episode",
      title,
      shortLabel: weatherTitle(memory.kind, band),
      summary: joinSentences([
        `${weatherSummary(memory.kind, place)} ${effects}`,
        trendSentence(memory.trend, memory.staleness),
      ]),
      placeLabel: place,
      year: world.time.year,
      season: world.time.season,
      lastSeen: `${capitalize(world.time.season)} Y${world.time.year}`,
      recurrence: memory.trend === "reinforced" ? "repeated in memory" : memory.trend === "forming" ? "newer memory" : "fading memory",
      confidence: memory.strength,
      freshness: freshnessFromTrend(memory.trend, memory.staleness),
      status: weatherStatus(memory),
      currentResponse: response,
      consequences: weatherConsequences(memory),
      relatedPlaceIds: placeTileIdsForWeather(band),
      sourceTabs: ["overview", "survival", "place", "chronicle"],
      score: 32 + memory.strength * 40 + memory.routeCaution * 12 + memory.childElderRisk * 10,
      rawSourceLabels: ["Band.bodyCampLogistics.weatherMemories"],
      rawIds: [memory.kind],
      sourceReasonIds: memory.sourceReasonIds,
      scoringReasons: ["weather memory strength", "movement caution", "care burden exposure"],
    };
  });
}

function deriveGearReferents(context: ReferentContext): readonly ReferentDraft[] {
  const { band, world } = context;
  const logistics = band.bodyCampLogistics;
  if (logistics === undefined) {
    return [];
  }

  return logistics.materialWear.slice(0, 6).map((wear) => {
    const cause = gearCause(wear, band);
    const response = responseForGear(wear, band);
    return {
      id: `gear:${String(band.id)}:${wear.category}`,
      kind: "gear_material_issue",
      title: `${gearLabel(wear.category)} - ${wearConditionLabel(wear.condition)}`,
      shortLabel: gearLabel(wear.category),
      summary: joinSentences([
        `${cause} ${cleanPlayerText(wear.consequence)}`,
        response,
      ]),
      year: world.time.year,
      season: world.time.season,
      confidence: Math.max(wear.wear, wear.materialBasis),
      freshness: wear.condition === "recovering" ? "recovering" : wear.condition === "good" ? "recent" : "current",
      status: wearConditionLabel(wear.condition),
      currentResponse: response,
      consequences: [
        wear.category === "crossing_lashings" ? "Another whole-band crossing feels less safe until repair improves." : undefined,
        wear.category === "carrying_gear" ? "Heavy loads and dependents limit how far camp can move." : undefined,
        wear.category === "containers_wraps" ? "Keeping and carrying fragile foods is harder." : undefined,
        wear.laborCost >= 0.45 ? "Repair competes with food work for adult labor." : undefined,
      ].filter(isString),
      relatedPlaceIds: placeTileIdsForWeather(band),
      relatedResourceIds: materialResourceIds(band),
      sourceTabs: ["doing", "survival", "place", "chronicle"],
      score: 30 + wear.wear * 45 + wear.laborCost * 12,
      rawSourceLabels: ["Band.bodyCampLogistics.materialWear"],
      rawIds: [wear.category, wear.condition],
      sourceReasonIds: wear.reasonIds,
      scoringReasons: ["wear severity", "repair labor cost", "movement consequence"],
    };
  });
}

function deriveSicknessReferents(context: ReferentContext): readonly ReferentDraft[] {
  const { band, world } = context;
  const sickness = band.bodyCampLogistics?.sickness;
  if (sickness === undefined || !sickness.active) {
    return [];
  }

  const place = placeLabel(context, band.position);
  const causes = sickness.causeKinds.map(sicknessCauseLabel).slice(0, 4);
  const response = responseForSickness(sickness, band);
  return [{
    id: `sickness:${String(band.id)}:current`,
    kind: "sickness_source",
    title: `${capitalize(world.time.season)} Y${world.time.year} sickness in camp`,
    shortLabel: "Sickness in camp",
    summary: joinSentences([
      causes.length > 0
        ? `The band links the sickness to ${joinNaturalList(causes)} ${place === undefined ? "" : place}.`
        : `The band knows sickness is active ${place === undefined ? "in camp" : place}.`,
      `Care burden is ${intensityWord(sickness.careBurden)} and travel caution is ${intensityWord(sickness.travelCaution)}.`,
    ]),
    placeLabel: place,
    year: world.time.year,
    season: world.time.season,
    confidence: sickness.severity,
    freshness: sickness.recoverySignal >= 0.28 ? "recovering" : "current",
    status: sickness.recoverySignal >= 0.28 ? "recovering but still active" : `${intensityWord(sickness.severity)} sickness`,
    currentResponse: response,
    consequences: [
      sickness.activityPenalty >= 0.2 ? "Food and repair work lose spare labor." : undefined,
      sickness.careBurden >= 0.2 ? "Care work is visible in the daily burden." : undefined,
      sickness.travelCaution >= 0.2 ? "Moves are more cautious while people recover." : undefined,
      sickness.mortalityPressureBump > 0 ? "Mortality pressure is higher, but this record does not name individual deaths." : undefined,
    ].filter(isString),
    relatedPlaceIds: [band.position],
    relatedResourceIds: sickness.causeKinds
      .filter((cause) => cause === "risky_fallback_food" || cause === "spoiled_food" || cause === "bad_water")
      .map((cause) => cause),
    sourceTabs: ["overview", "survival", "food", "place", "chronicle"],
    score: 48 + sickness.severity * 45 + sickness.careBurden * 18,
    rawSourceLabels: ["Band.bodyCampLogistics.sickness"],
    rawIds: sickness.causeKinds,
    sourceReasonIds: sickness.reasonIds,
    scoringReasons: ["active sickness", "care burden", "travel caution"],
  }];
}

function deriveFoodResourceReferents(context: ReferentContext): readonly ReferentDraft[] {
  const { band, world } = context;
  const drafts: ReferentDraft[] = [];

  for (const candidate of band.foragingAdaptation?.fallbackCandidates.slice(0, 6) ?? []) {
    const label = resourceLabel(candidate.resourceClassId);
    const place = placeLabel(context, candidate.tileId);
    const response = responseForFallback(candidate.level, candidate.riskCost);
    drafts.push({
      id: `food:${String(band.id)}:${String(candidate.tileId)}:${candidate.resourceClassId}`,
      kind: "food_patch",
      title: `${capitalize(label)} patch ${place ?? "in remembered country"}`,
      shortLabel: `${capitalize(label)} ${shortPlaceSuffix(place)}`,
      summary: joinSentences([
        `${capitalize(label)} is remembered as a fallback ${place ?? "in known ground"}.`,
        `It is ${laborRiskPhrase(candidate.laborCost, candidate.riskCost)}, with ${confidenceWord(candidate.confidence)} confidence.`,
        response,
      ]),
      placeLabel: place,
      year: world.time.year,
      season: world.time.season,
      confidence: candidate.confidence,
      freshness: candidate.level === "watching" ? "uncertain" : "current",
      status: fallbackStatus(candidate.level),
      currentResponse: response,
      consequences: [
        candidate.riskCost >= 0.3 ? "People remember risk or sickness around this food." : undefined,
        candidate.laborCost >= 0.45 ? "Digging, processing, or carrying costs make it a costly fallback." : undefined,
        candidate.expectedUsefulness >= 0.45 ? "Hunger keeps this source in the current survival plan." : undefined,
      ].filter(isString),
      relatedPlaceIds: [candidate.tileId],
      relatedResourceIds: [candidate.resourceClassId],
      sourceTabs: ["overview", "food", "survival", "chronicle"],
      score: 34 + candidate.expectedUsefulness * 38 + candidate.riskCost * 16 + candidate.laborCost * 12,
      rawSourceLabels: ["Band.foragingAdaptation.fallbackCandidates"],
      rawIds: [String(candidate.tileId), candidate.resourceClassId, candidate.level],
      sourceReasonIds: candidate.reasonIds,
      scoringReasons: ["fallback usefulness", "risk cost", "labor cost"],
    });
  }

  for (const memory of band.resourceEcology?.topResourcePlaceMemories.slice(0, 8) ?? []) {
    const label = cleanResourceLabel(memory.label);
    const place = placeLabel(context, memory.tileId);
    const response = responseForResourceMemory(memory.seasonalFailureCount, memory.pressure, memory.overuseNote);
    drafts.push({
      id: `resource:${String(band.id)}:${String(memory.tileId)}:${memory.resourceClassId}`,
      kind: memory.resourceClassId.includes("plant") || memory.resourceClassId.includes("fallback") ? "food_patch" : "resource_place",
      title: `${capitalize(label)} source ${place ?? "in remembered country"}`,
      shortLabel: `${capitalize(label)} ${shortPlaceSuffix(place)}`,
      summary: joinSentences([
        `${capitalize(label)} is tied to ${place ?? "a remembered place"}, not just a resource class.`,
        `The record shows ${countNoun(memory.visitsOrUses, "recorded visit or use", "recorded visits or uses")}, ${countNoun(memory.seasonalSuccessCount, "success", "successes")}, and ${countNoun(memory.seasonalFailureCount, "failure")}.`,
        memory.overuseNote,
      ]),
      placeLabel: place,
      year: memory.lastUpdatedYear,
      season: memory.lastUpdatedSeason,
      lastSeen: `${capitalize(memory.lastUpdatedSeason)} Y${memory.lastUpdatedYear}`,
      recurrence: memory.visitsOrUses > 1 ? `${memory.visitsOrUses} recorded uses` : "single remembered use",
      confidence: Math.max(0.25, Math.min(1, memory.contributionToSupport + 0.35)),
      freshness: memory.pressure >= 0.45 ? "worsening" as MemoryReferentFreshness : memory.seasonalFailureCount > memory.seasonalSuccessCount ? "uncertain" : "recent",
      status: memory.pressure >= 0.45 ? "under pressure" : memory.seasonalFailureCount > memory.seasonalSuccessCount ? "uncertain returns" : "useful memory",
      currentResponse: response,
      consequences: [
        memory.contributionToSupport >= 0.12 ? "It currently explains part of food support." : undefined,
        memory.pressure >= 0.35 ? "Repeated use is making returns less reliable." : undefined,
        memory.protoCampReasonLinks.length > 0 ? "This resource helps explain why the place matters." : undefined,
      ].filter(isString),
      relatedPlaceIds: [memory.tileId],
      relatedResourceIds: [memory.resourceClassId],
      sourceTabs: ["overview", "food", "place", "chronicle"],
      score: 28 + memory.contributionToSupport * 70 + memory.visitsOrUses * 2 + memory.pressure * 14,
      rawSourceLabels: ["Band.resourceEcology.topResourcePlaceMemories"],
      rawIds: [String(memory.tileId), memory.resourceClassId],
      scoringReasons: ["place-specific resource memory", "support contribution", "pressure"],
    });
  }

  for (const record of band.foragingAdaptation?.learningRecords.slice(0, 5) ?? []) {
    if (record.fallbackStatus === "none" && record.status !== "known_risky") {
      continue;
    }
    const label = resourceLabel(record.resourceClassId);
    const place = placeLabel(context, record.tileId);
    drafts.push({
      id: `food-learning:${String(band.id)}:${String(record.tileId)}:${record.resourceClassId}`,
      kind: "food_patch",
      title: `${capitalize(label)} learning ${place ?? "in remembered country"}`,
      shortLabel: `${capitalize(label)} learning`,
      summary: joinSentences([
        `${capitalize(label)} is ${learningStatusLabel(record.status)} ${place ?? "in known ground"}.`,
        record.unlockHint.length > 0 ? record.unlockHint : record.gatedReason,
      ]),
      placeLabel: place,
      year: world.time.year,
      season: world.time.season,
      confidence: record.confidence,
      freshness: record.status === "known_risky" ? "repeated" : "uncertain",
      status: learningStatusLabel(record.status),
      currentResponse: record.fallbackStatus === "emergency" ? "Hunger is pushing cautious use despite risk." : "The band is still testing or watching this food.",
      consequences: [
        record.riskStatus === "known_risk" || record.riskStatus === "high" ? "Risk is part of the memory, not just a low score." : undefined,
        record.testCount > 0 ? "Prior tests shape whether people trust it." : undefined,
      ].filter(isString),
      relatedPlaceIds: [record.tileId],
      relatedResourceIds: [record.resourceClassId],
      sourceTabs: ["food", "survival"],
      score: 24 + record.confidence * 20 + record.testCount * 3 + (record.riskStatus === "known_risk" ? 14 : 0),
      rawSourceLabels: ["Band.foragingAdaptation.learningRecords"],
      rawIds: [String(record.tileId), record.resourceClassId, record.status, record.fallbackStatus],
      sourceReasonIds: record.reasonIds,
      scoringReasons: ["food learning status", "fallback status", "risk status"],
    });
  }

  return drafts;
}

function deriveNatureReferents(context: ReferentContext): readonly ReferentDraft[] {
  const { band, world } = context;
  const nature = band.visibleNature;
  if (nature === undefined) {
    return [];
  }

  const drafts: ReferentDraft[] = [];

  for (const card of nature.faunaCards.slice(0, 5)) {
    const place = placeLabel(context, card.anchorTileId);
    drafts.push({
      id: `animal:${String(band.id)}:${card.stockId}:${String(card.anchorTileId)}`,
      kind: "animal_sign",
      title: `${card.label} sign ${place ?? "in remembered country"}`,
      shortLabel: `${card.label} sign`,
      summary: joinSentences([
        `${card.label} is known through ${animalKnownnessLabel(card.knownness)} ${place ?? "around known ground"}.`,
        `The sign is ${animalUsefulnessLabel(card.usefulness)} and ${confidenceWord(card.confidence)}.`,
        card.risk >= 0.45 ? "People treat it as a risk as well as a resource clue." : undefined,
      ]),
      placeLabel: place,
      year: world.time.year,
      season: world.time.season,
      confidence: card.confidence,
      freshness: card.knownness === "stale_route" ? "stale" : card.knownness === "reliable_route" ? "repeated" : "recent",
      status: animalKnownnessLabel(card.knownness),
      currentResponse: card.risk >= 0.55 ? "The band moves and hunts more cautiously around this sign." : "The sign helps guide foraging and route confidence.",
      consequences: [
        card.routeReliability >= 0.45 ? "It marks a route people can follow or watch." : undefined,
        card.wariness >= 0.45 ? "Animals are wary enough to make hunting harder." : undefined,
        card.huntingOrFishingPressure >= 0.45 ? "Repeated pressure may be changing the sign." : undefined,
      ].filter(isString),
      relatedPlaceIds: [card.anchorTileId, ...card.seenTileIds].slice(0, RELATED_ID_CAP),
      relatedResourceIds: [card.stockId],
      sourceTabs: ["nature", "food", "place", "chronicle"],
      score: 24 + card.confidence * 26 + card.risk * 14 + card.routeReliability * 16,
      rawSourceLabels: ["Band.visibleNature.faunaCards"],
      rawIds: [card.stockId, card.knownness, card.usefulness],
      scoringReasons: ["animal sign confidence", "route reliability", "risk"],
    });
  }

  for (const record of band.relationshipMemory?.animalFamiliarity.slice(0, 4) ?? []) {
    const place = record.sourceTileIds[0] === undefined ? undefined : placeLabel(context, record.sourceTileIds[0]);
    drafts.push({
      id: `animal-familiarity:${String(band.id)}:${record.stockId}`,
      kind: "animal_sign",
      title: `${record.label} memory`,
      shortLabel: record.label,
      summary: joinSentences([
        `${record.label} ${animalFamiliarityLabel(record.kind)} ${place ?? "in the band's range"}.`,
        cleanPlayerText(record.basis),
      ]),
      placeLabel: place,
      year: world.time.year,
      season: world.time.season,
      confidence: record.confidence,
      freshness: record.animalWariness >= 0.45 ? "worsening" as MemoryReferentFreshness : "repeated",
      status: animalFamiliarityLabel(record.kind),
      currentResponse: record.risk >= 0.5 ? "People keep more caution around this animal sign." : "This memory helps people decide where to look or avoid.",
      consequences: [
        record.animalWariness >= 0.4 ? "Animals have learned to avoid people." : undefined,
        record.campFollowing >= 0.4 ? "Camp scraps or people draw the animal closer." : undefined,
      ].filter(isString),
      relatedPlaceIds: record.sourceTileIds,
      relatedResourceIds: [record.stockId],
      sourceTabs: ["nature", "people", "chronicle"],
      score: 28 + record.confidence * 28 + record.risk * 12 + record.humanLearning * 12,
      rawSourceLabels: ["Band.relationshipMemory.animalFamiliarity"],
      rawIds: [record.stockId, record.kind],
      sourceReasonIds: record.reasonIds,
      scoringReasons: ["animal familiarity", "risk", "human learning"],
    });
  }

  for (const card of nature.aquaticCards.slice(0, 5)) {
    const place = placeLabel(context, card.anchorTileId);
    drafts.push({
      id: `aquatic:${String(band.id)}:${card.stockId}:${String(card.anchorTileId)}`,
      kind: "aquatic_place",
      title: `${card.label} ${place ?? "at remembered water"}`,
      shortLabel: `${card.label} water place`,
      summary: joinSentences([
        `${card.label} is tied to ${place ?? "known water-edge ground"}.`,
        `Access is ${laborRiskPhrase(card.laborAccessCost, card.riskDifficulty)} and the place is ${abundanceLabel(card.abundanceProductivity)}.`,
      ]),
      placeLabel: place,
      year: world.time.year,
      season: world.time.season,
      confidence: card.confidence,
      freshness: card.aquaticEffect === "recovery" ? "recovering" : card.aquaticEffect === "overfished" ? "worsening" as MemoryReferentFreshness : "recent",
      status: aquaticEffectLabel(card.aquaticEffect),
      currentResponse: card.aquaticEffect === "overfished" ? "The band cannot lean on this water food without wearing it down further." : "The band treats it as a known water-edge food source.",
      consequences: [
        card.pressure >= 0.35 ? "Fishing or gathering pressure is visible in the memory." : undefined,
        card.recovery >= 0.35 ? "Recovery is visible enough to matter." : undefined,
        card.protoCampLink !== "none" ? "It helps explain why a nearby camp or stopping place matters." : undefined,
      ].filter(isString),
      relatedPlaceIds: [card.anchorTileId, ...card.seenTileIds].slice(0, RELATED_ID_CAP),
      relatedResourceIds: [card.stockId, card.resourceClassId],
      sourceTabs: ["food", "nature", "place", "chronicle"],
      score: 24 + card.confidence * 24 + card.reliability * 18 + card.pressure * 12,
      rawSourceLabels: ["Band.visibleNature.aquaticCards"],
      rawIds: [card.stockId, card.aquaticEffect],
      scoringReasons: ["aquatic confidence", "reliability", "pressure"],
    });
  }

  for (const card of nature.plantCards.slice(0, 6)) {
    const place = placeLabel(context, card.tileId);
    drafts.push({
      id: `plant:${String(band.id)}:${String(card.tileId)}:${card.patchId}`,
      kind: "food_patch",
      title: `${card.label} patch ${place ?? "in remembered country"}`,
      shortLabel: `${card.label} patch`,
      summary: joinSentences([
        `${card.label} is a remembered plant patch ${place ?? "in known ground"}.`,
        `It is ${plantUseStatusLabel(card.useStatus)} and ${laborRiskPhrase(card.laborCost, card.risk === "high" ? 0.55 : card.risk === "unknown" ? 0.35 : 0.12)}.`,
      ]),
      placeLabel: place,
      year: world.time.year,
      season: world.time.season,
      confidence: card.confidence,
      freshness: card.useStatus === "stale" ? "stale" : card.useStatus === "overused" ? "worsening" : card.recovery >= 0.35 ? "recovering" : "recent",
      status: plantUseStatusLabel(card.useStatus),
      currentResponse: card.useStatus === "avoided" ? "People are avoiding it unless hunger forces another look." : card.fallbackRole !== "none" ? "Hunger can push the band back to this patch." : "It remains part of ordinary plant gathering.",
      consequences: [
        card.fallbackRole !== "none" ? "This patch can become fallback food." : undefined,
        card.depletion >= 0.35 ? "Use has depleted the patch." : undefined,
        card.recovery >= 0.35 ? "Recovery is visible." : undefined,
      ].filter(isString),
      relatedPlaceIds: [card.tileId],
      relatedResourceIds: [card.patchId, card.plantClassId, card.linkedResourceClassId].filter(isString),
      sourceTabs: ["food", "nature", "place", "chronicle"],
      score: 25 + card.confidence * 24 + card.fallbackRank * 18 + card.depletion * 12,
      rawSourceLabels: ["Band.visibleNature.plantCards"],
      rawIds: [card.patchId, card.plantClassId, card.useStatus],
      scoringReasons: ["plant patch confidence", "fallback rank", "depletion"],
    });
  }

  for (const card of nature.forestCards.slice(0, 5)) {
    const place = placeLabel(context, card.tileId);
    drafts.push({
      id: `forest:${String(band.id)}:${String(card.tileId)}:${card.patchId}`,
      kind: "forest_place",
      title: `${forestLabel(card.coverType)} ${place ?? "in remembered country"}`,
      shortLabel: forestLabel(card.coverType),
      summary: joinSentences([
        `${forestLabel(card.coverType)} is remembered ${place ?? "around known ground"}.`,
        forestUsePhrase(card),
      ]),
      placeLabel: place,
      year: world.time.year,
      season: world.time.season,
      confidence: card.confidence,
      freshness: card.knowledgeState === "stale" ? "stale" : card.growthTrend === "recovering" ? "recovering" : "recent",
      status: forestTrendLabel(card.growthTrend),
      currentResponse: card.pressure >= 0.45 ? "People use it, but pressure makes the place less forgiving." : "It helps with shelter, visibility, fuel, plants, or animal signs when nearby.",
      consequences: [
        card.woodFuelMaterialHook >= 0.4 ? "Fuel or repair material may be easier here." : undefined,
        card.animalHabitatValue >= 0.4 ? "Animal signs are more likely around this stand." : undefined,
        card.movementAccessEffect <= 0.35 ? "Dense growth can make movement harder." : undefined,
      ].filter(isString),
      relatedPlaceIds: [card.tileId],
      relatedResourceIds: [card.patchId, ...card.linkedAnimalSigns, ...card.linkedPlantPatches].slice(0, RELATED_ID_CAP),
      sourceTabs: ["nature", "place", "chronicle"],
      score: 20 + card.confidence * 20 + card.pressure * 12 + card.woodFuelMaterialHook * 12 + card.animalHabitatValue * 8,
      rawSourceLabels: ["Band.visibleNature.forestCards"],
      rawIds: [card.patchId, card.coverType, card.growthTrend],
      scoringReasons: ["forest confidence", "use pressure", "material and habitat value"],
    });
  }

  return drafts;
}

function deriveAccidentReferents(context: ReferentContext): readonly ReferentDraft[] {
  const { band } = context;
  const drafts: ReferentDraft[] = [];

  for (const episode of band.acuteRisk?.recentEpisodes.slice(0, 6) ?? []) {
    const place = episode.context.sourceTileId === undefined ? undefined : placeLabel(context, episode.context.sourceTileId);
    const response = responseForAcuteRisk(episode.kind, band);
    drafts.push({
      id: `accident:${String(band.id)}:${episode.id}`,
      kind: "accident",
      title: `${capitalize(episode.season)} Y${episode.year} ${acuteKindLabel(episode.kind)}`,
      shortLabel: acuteKindLabel(episode.kind),
      summary: joinSentences([
        `${acuteKindLabel(episode.kind)} happened near ${cleanPlayerText(episode.context.sourceLabel)}${place === undefined ? "" : `, ${place}`}.`,
        episode.groundedReasons[0],
        accidentOutcomeLine(episode),
      ]),
      placeLabel: place,
      year: episode.year,
      season: episode.season,
      lastSeen: `${capitalize(episode.season)} Y${episode.year}`,
      confidence: episode.confidence,
      freshness: episode.remainingRecoverySeasons > 0 ? "recent" : "stale",
      status: `${severityLabel(episode.severity)}; recovery ${episode.remainingRecoverySeasons > 0 ? "still matters" : "mostly past"}`,
      currentResponse: response,
      consequences: [
        episode.affectedActivityEfficiency ? "Activity efficiency is reduced while people recover." : undefined,
        episode.affectedMovementCaution ? "Movement caution increased." : undefined,
        episode.affectedStress ? "Seasonal stress rose." : undefined,
        episode.affectedMortalityPressure ? "Mortality pressure rose, but the episode records no direct population kill." : "No deaths are recorded directly on this episode.",
      ].filter(isString),
      relatedPlaceIds: episode.context.sourceTileId === undefined ? [] : [episode.context.sourceTileId],
      relatedResourceIds: [episode.context.sourceResourceId, episode.context.sourceTraceId].filter(isString),
      sourceTabs: ["overview", "survival", "nature", "place", "chronicle"],
      score: 42 + severityScore(episode.severity) * 20 + episode.effect.recoverySeasons * 4 + episode.effect.movementCautionBump * 12,
      rawSourceLabels: ["Band.acuteRisk.recentEpisodes"],
      rawIds: [episode.id, episode.kind, episode.severity, episode.context.sourceCategory],
      sourceReasonIds: episode.reasonIds,
      scoringReasons: ["acute risk severity", "recovery duration", "movement caution"],
    });
  }

  for (const move of band.recentResidentialMoveEvents?.slice(0, 6) ?? []) {
    const watercraft = move.temporaryWatercraft;
    if (watercraft === undefined || !isDifficultCrossingResult(watercraft.result)) {
      continue;
    }
    const place = watercraft.sourceTileId === undefined ? placeLabel(context, move.fromTileId) : placeLabel(context, watercraft.sourceTileId);
    drafts.push({
      id: `crossing-attempt:${String(band.id)}:${String(move.eventId)}`,
      kind: "accident",
      title: `${capitalize(move.season)} Y${yearFromTick(move.tick)} crossing attempt`,
      shortLabel: "Crossing attempt",
      summary: joinSentences([
        `A ${cleanPlayerText(watercraft.optionLabel ?? "temporary crossing")} attempt ${crossingResultLabel(watercraft.result)} ${place ?? "on a remembered route"}.`,
        cleanPlayerText(watercraft.reason),
      ]),
      placeLabel: place,
      year: yearFromTick(move.tick),
      season: move.season,
      confidence: move.confidence,
      freshness: "recent",
      status: crossingResultLabel(watercraft.result),
      currentResponse: watercraft.result === "crossing_partial_success" || watercraft.result === "crossing_delayed_materials"
        ? "The band delays or repairs before trusting another whole-band crossing."
        : "The band is avoiding this crossing risk for now.",
      consequences: [
        move.hardshipReason,
        watercraft.materialConfidence < 0.35 ? "Known crossing material is weak or missing." : undefined,
        watercraft.riverRisk >= 0.45 ? "River risk is remembered as a real obstacle." : undefined,
      ].filter(isString).map(cleanPlayerText),
      relatedEventIds: [move.eventId],
      relatedPlaceIds: [move.fromTileId, move.toTileId, watercraft.sourceTileId, watercraft.targetTileId].filter(isTileId),
      relatedResourceIds: watercraft.materialBasis,
      sourceTabs: ["doing", "survival", "place", "chronicle"],
      score: 38 + watercraft.riverRisk * 18 + watercraft.seasonExposureRisk * 12 + (move.hardshipLevel === "severe" ? 18 : 0),
      rawSourceLabels: ["Band.recentResidentialMoveEvents.temporaryWatercraft"],
      rawIds: [String(move.eventId), watercraft.result, watercraft.traceType],
      sourceReasonIds: [...move.reasonIds, ...watercraft.reasonIds],
      scoringReasons: ["crossing result", "river risk", "move hardship"],
    });
  }

  return drafts;
}

function derivePlaceReferents(context: ReferentContext): readonly ReferentDraft[] {
  const { band } = context;
  const places = uniquePlaces([
    ...(band.protoCampMemory?.currentPlace === undefined ? [] : [band.protoCampMemory.currentPlace]),
    ...(band.protoCampMemory?.topPlaces ?? []),
  ]);

  return places.slice(0, 8).map((place) => campReferent(context, place));
}

function deriveRouteReferents(context: ReferentContext): readonly ReferentDraft[] {
  const { band } = context;
  const drafts: ReferentDraft[] = [];

  for (const route of Object.values(band.travelCorridors).slice(0, 6)) {
    drafts.push(routeReferent(context, route));
  }

  for (const route of band.relationshipMemory?.routeFamiliarity.slice(0, 6) ?? []) {
    const place = placeLabel(context, route.fromTileId);
    drafts.push({
      id: `route-familiarity:${String(band.id)}:${String(route.fromTileId)}:${String(route.toTileId)}:${route.kind}`,
      kind: "route",
      title: `${routeKindLabel(route.kind)} ${place ?? "in remembered country"}`,
      shortLabel: routeKindLabel(route.kind),
      summary: joinSentences([
        `${capitalize(routeKindLabel(route.kind))} is ${routeStatusLabel(route.status)}.`,
        cleanPlayerText(route.basis),
        `People use it for ${route.useCount} remembered passage${plural(route.useCount)}.`,
      ]),
      placeLabel: place,
      confidence: route.confidence,
      freshness: route.status === "stale" ? "stale" : route.status === "improving" ? "recovering" : route.status === "strained" ? "worsening" as MemoryReferentFreshness : "repeated",
      status: routeStatusLabel(route.status),
      currentResponse: route.risk >= 0.45 ? "The route is used cautiously or avoided when carrying loads are high." : "The route remains useful for moving through familiar country.",
      consequences: [
        route.failureCount > 0 ? "Failures are part of the memory." : undefined,
        route.risk >= 0.45 ? "Risk still affects route confidence." : undefined,
      ].filter(isString),
      relatedPlaceIds: [route.fromTileId, route.toTileId],
      sourceTabs: ["doing", "place", "chronicle"],
      score: 26 + route.useCount * 2 + route.confidence * 20 + route.risk * 10,
      rawSourceLabels: ["Band.relationshipMemory.routeFamiliarity"],
      rawIds: [route.kind, route.status],
      sourceReasonIds: route.reasonIds,
      scoringReasons: ["route use count", "route confidence", "route risk"],
    });
  }

  for (const crossing of Object.values(band.crossingMemories).slice(0, 8)) {
    const place = placeLabel(context, crossing.crossingTileA);
    drafts.push({
      id: `crossing:${String(band.id)}:${String(crossing.crossingTileA)}:${String(crossing.crossingTileB)}:${String(crossing.riverId)}`,
      kind: "crossing",
      title: `Remembered crossing ${place ?? "on known water"}`,
      shortLabel: "Remembered crossing",
      summary: joinSentences([
        `The band remembers this crossing from ${capitalize(crossing.firstUsedAt.season)} Y${crossing.firstUsedAt.year} to ${capitalize(crossing.lastUsedAt.season)} Y${crossing.lastUsedAt.year}.`,
        `It has ${crossing.useCount} recorded use${plural(crossing.useCount)}, ${confidenceWord(crossing.successConfidence)} success confidence, and ${intensityWord(crossing.riskMemory)} risk memory.`,
      ]),
      placeLabel: place,
      year: crossing.lastUsedAt.year,
      season: crossing.lastUsedAt.season,
      firstSeen: `${capitalize(crossing.firstUsedAt.season)} Y${crossing.firstUsedAt.year}`,
      lastSeen: `${capitalize(crossing.lastUsedAt.season)} Y${crossing.lastUsedAt.year}`,
      recurrence: `${crossing.useCount} recorded use${plural(crossing.useCount)}`,
      confidence: crossing.successConfidence,
      freshness: crossing.riskMemory >= 0.45 ? "repeated" : crossing.seasonalReliability >= 0.55 ? "recent" : "uncertain",
      status: crossing.riskMemory >= 0.45 ? "risky crossing memory" : crossing.successConfidence >= 0.6 ? "usable known crossing" : "uncertain crossing",
      currentResponse: crossing.riskMemory >= 0.45 ? "Whole-band moves stay cautious here unless gear, weather, and labor improve." : "The crossing can support movement when the season and load allow it.",
      consequences: [
        crossing.riskMemory >= 0.35 ? "Bad crossings can delay relocation." : undefined,
        crossing.seasonalReliability < 0.45 ? "Seasonal reliability is uncertain." : undefined,
      ].filter(isString),
      relatedPlaceIds: [crossing.crossingTileA, crossing.crossingTileB],
      sourceTabs: ["doing", "survival", "place", "chronicle"],
      score: 34 + crossing.useCount * 3 + crossing.riskMemory * 18 + crossing.successConfidence * 10,
      rawSourceLabels: ["Band.crossingMemories"],
      rawIds: [String(crossing.riverId), crossing.crossingClass],
      sourceReasonIds: crossing.reasonIds,
      scoringReasons: ["crossing use count", "risk memory", "success confidence"],
    });
  }

  return drafts;
}

function deriveAccessReferents(context: ReferentContext): readonly ReferentDraft[] {
  const { band } = context;
  const accessPlaces = uniqueAccessPlaces([
    ...(band.protoAccessMemory?.currentPlace === undefined ? [] : [band.protoAccessMemory.currentPlace]),
    ...(band.protoAccessMemory?.topPlaces ?? []),
  ]);

  return accessPlaces.slice(0, 6).map((access) => {
    const place = placeLabel(context, access.tileId);
    return {
      id: `access:${String(band.id)}:${String(access.tileId)}:${access.placeType}`,
      kind: "access_place",
      title: `${accessPlaceTypeLabel(access.placeType)} ${place ?? "in remembered country"}`,
      shortLabel: accessPlaceTypeLabel(access.placeType),
      summary: joinSentences([
        `${capitalize(accessPlaceTypeLabel(access.placeType))} is remembered as ${accessStateLabel(access.accessState)}.`,
        access.topReasons[0],
        "These are expectations about shared use, not fixed rules or borders.",
      ]),
      placeLabel: place,
      confidence: access.confidence,
      freshness: access.staleYears > 4 ? "stale" : access.rememberedRefusalAvoidance > 0.35 ? "repeated" : "recent",
      status: accessStateLabel(access.accessState),
      currentResponse: access.strangerCaution >= 0.45 ? "People stay watchful around unfamiliar users here." : "The place remains usable through familiar habits and caution.",
      consequences: [
        access.sharedUsePressure >= 0.35 ? "Shared use can add social pressure." : undefined,
        access.placeSensitivity >= 0.45 ? "People treat the place as sensitive." : undefined,
      ].filter(isString),
      relatedPlaceIds: [access.tileId],
      sourceTabs: ["people", "place", "chronicle"],
      score: 24 + access.accessImportance * 25 + access.placeSensitivity * 16 + access.sharedUsePressure * 10,
      rawSourceLabels: ["Band.protoAccessMemory"],
      rawIds: [access.placeType, access.accessState],
      sourceReasonIds: access.sourceReasonIds,
      scoringReasons: ["access importance", "place sensitivity", "shared use pressure"],
    };
  });
}

function deriveSocialReferents(context: ReferentContext): readonly ReferentDraft[] {
  const { band, world } = context;
  const drafts: ReferentDraft[] = [];

  for (const reputation of band.relationshipMemory?.reputations.slice(0, 5) ?? []) {
    const otherBand = world.bands[reputation.otherBandId];
    const label = otherBand?.name ?? "another remembered band";
    drafts.push({
      id: `relation:${String(band.id)}:${String(reputation.otherBandId)}`,
      kind: "social_relation",
      title: `${label} ${reputationKindLabel(reputation.kind)}`,
      shortLabel: label,
      summary: joinSentences([
        `${label} ${reputationKindLabel(reputation.kind)}.`,
        cleanPlayerText(reputation.basis),
      ]),
      confidence: reputation.familiarity,
      freshness: reputation.staleness >= 0.55 ? "stale" : "repeated",
      status: reputationKindLabel(reputation.kind),
      currentResponse: reputation.tension >= 0.45 ? "The band stays watchful around this relationship." : "This memory shapes tolerance, support, and caution.",
      consequences: [
        reputation.sharedUse >= 0.35 ? "Shared-use places are part of the relationship." : undefined,
        reputation.trust >= 0.45 ? "Trust can ease temporary support." : undefined,
      ].filter(isString),
      relatedBandIds: [reputation.otherBandId],
      sourceTabs: ["people", "chronicle"],
      score: 22 + reputation.familiarity * 20 + reputation.tension * 12 + reputation.sharedUse * 10,
      rawSourceLabels: ["Band.relationshipMemory.reputations"],
      rawIds: [String(reputation.otherBandId), reputation.kind],
      sourceReasonIds: reputation.reasonIds,
      scoringReasons: ["reputation familiarity", "tension", "shared use"],
    });
  }

  for (const aggregation of band.relationshipMemory?.seasonalAggregations.slice(0, 4) ?? []) {
    const place = placeLabel(context, aggregation.tileId);
    drafts.push({
      id: `aggregation:${String(band.id)}:${String(aggregation.tileId)}:${aggregation.trigger}`,
      kind: "social_relation",
      title: `Temporary gathering ${place ?? "at a remembered place"}`,
      shortLabel: "Temporary gathering",
      summary: joinSentences([
        `People gather around ${aggregationTriggerLabel(aggregation.trigger)} ${place ?? "in known country"}.`,
        cleanPlayerText(aggregation.basis),
        "The gathering is temporary and disperses when the seasonal reason passes.",
      ]),
      placeLabel: place,
      confidence: aggregation.intensity,
      freshness: "recent",
      status: aggregation.tension >= 0.45 ? "useful but tense" : "temporary gathering",
      currentResponse: aggregation.dispersalSignal >= 0.45 ? "The band is likely to disperse as the pressure passes." : "People tolerate the gathering while the seasonal reason lasts.",
      consequences: [
        aggregation.tension >= 0.35 ? "Crowding can strain tolerance." : undefined,
        aggregation.tolerance >= 0.45 ? "Familiar use makes the crowd easier to bear." : undefined,
      ].filter(isString),
      relatedPlaceIds: [aggregation.tileId],
      sourceTabs: ["people", "place", "chronicle"],
      score: 24 + aggregation.intensity * 22 + aggregation.tension * 12,
      rawSourceLabels: ["Band.relationshipMemory.seasonalAggregations"],
      rawIds: [aggregation.trigger, aggregation.expectedDuration],
      sourceReasonIds: aggregation.reasonIds,
      scoringReasons: ["aggregation intensity", "tension", "place link"],
    });
  }

  for (const failure of band.relationshipMemory?.failureStories.slice(0, 5) ?? []) {
    const place = failure.tileId === undefined ? undefined : placeLabel(context, failure.tileId);
    drafts.push({
      id: `failure-story:${String(band.id)}:${failure.kind}:${failure.tileId === undefined ? "no-place" : String(failure.tileId)}`,
      kind: "talk_source",
      title: `${failureStoryLabel(failure.kind)} ${place ?? ""}`.trim(),
      shortLabel: failureStoryLabel(failure.kind),
      summary: joinSentences([
        cleanPlayerText(failure.phrase),
        cleanPlayerText(failure.basis),
      ]),
      placeLabel: place,
      confidence: failure.strength,
      freshness: failure.trend === "stale" ? "stale" : failure.trend === "fading" ? "stale" : "repeated",
      status: failure.trend === "reinforced" ? "reinforced caution" : failure.trend === "stale" ? "stale caution" : "remembered caution",
      currentResponse: failure.caution >= 0.45 ? "People act more cautiously around the remembered problem." : "The memory remains a warning, but it is not dominant.",
      consequences: [
        failure.caution >= 0.35 ? "It can make later moves, foods, or camps feel riskier." : undefined,
      ].filter(isString),
      relatedPlaceIds: failure.tileId === undefined ? [] : [failure.tileId],
      sourceTabs: ["people", "survival", "place", "chronicle"],
      score: 24 + failure.strength * 24 + failure.caution * 16,
      rawSourceLabels: ["Band.relationshipMemory.failureStories"],
      rawIds: [failure.kind, failure.trend],
      sourceReasonIds: failure.reasonIds,
      scoringReasons: ["failure memory strength", "caution", "trend"],
    });
  }

  return drafts;
}

function deriveTalkReferents(context: ReferentContext): readonly ReferentDraft[] {
  const { band, world } = context;
  const items = band.campRumors?.items ?? [];
  const ledger = band.campRumors?.repetitionLedger ?? [];
  const drafts: ReferentDraft[] = [];

  for (const item of items.slice(0, 8)) {
    drafts.push(talkItemReferent(context, item, world.time.year, world.time.season));
  }

  for (const record of ledger.slice(0, 6)) {
    drafts.push(talkLedgerReferent(context, record, world.time.year, world.time.season));
  }

  return drafts;
}

function deriveEventReferents(context: ReferentContext): readonly ReferentDraft[] {
  const { band } = context;
  return (band.eventHistory?.recentEvents ?? [])
    .filter((event) => event.salience !== "low")
    .slice(0, 8)
    .map((event) => {
      const place = event.relatedTileId === undefined ? undefined : placeLabel(context, event.relatedTileId);
      return {
        id: `event:${String(band.id)}:${String(event.eventId)}`,
        kind: "event_source",
        title: cleanPlayerText(event.title),
        shortLabel: cleanPlayerText(event.title),
        summary: joinSentences([
          cleanPlayerText(event.description),
          event.detail,
        ]),
        placeLabel: place,
        year: event.year,
        season: event.season,
        confidence: event.salience === "high" ? 0.85 : 0.55,
        freshness: "recent",
        status: event.salience === "high" ? "major remembered event" : "notable remembered event",
        currentResponse: responseForEventCategory(event.category),
        consequences: [event.detail].filter(isString).map(cleanPlayerText),
        relatedEventIds: [event.eventId],
        relatedPlaceIds: event.relatedTileId === undefined ? [] : [event.relatedTileId],
        relatedBandIds: event.relatedBandId === undefined ? [] : [event.relatedBandId],
        sourceTabs: ["overview", "chronicle"],
        score: event.salience === "high" ? 52 : 38,
        rawSourceLabels: ["Band.eventHistory.recentEvents"],
        rawIds: [String(event.eventId), event.category, event.stateKey],
        sourceReasonIds: event.sourceReasonIds,
        scoringReasons: ["event salience", "recent selected-band event"],
      };
    });
}

function campReferent(context: ReferentContext, place: ProtoCampPlaceMemory): ReferentDraft {
  const placeText = placeLabel(context, place.tileId);
  const response = responseForCamp(place, context.band);
  return {
    id: `camp:${String(context.band.id)}:${String(place.tileId)}`,
    kind: "camp_place",
    title: `${campStateLabel(place.campLikeState)} ${placeText ?? ""}`.trim(),
    shortLabel: campStateLabel(place.campLikeState),
    summary: joinSentences([
      place.visitCount === 0
        ? `This is a candidate remembered place ${placeText ?? "in known country"}, not an occupied camp yet.`
        : `Use: ${place.visitCount} recorded visit${plural(place.visitCount)} across ${place.seasonsUsed.map(capitalize).join(", ") || "known seasons"}.`,
      `State: ${campTrendLabel(place.lifecycleTrend)} and ${usePressureLabel(place.usePressureStatus)}.`,
      whyReturnToCamp(place),
      whyCampFragile(place),
    ]),
    placeLabel: placeText,
    year: place.lastUsedYear,
    season: place.lastUsedSeason,
    firstSeen: `tick ${Number(place.firstObservedTick)}`,
    lastSeen: `${capitalize(place.lastUsedSeason)} Y${place.lastUsedYear}`,
    recurrence: place.visitCount === 0 ? "candidate place" : `${place.visitCount} recorded visit${plural(place.visitCount)}`,
    confidence: place.confidence,
    freshness: place.staleYears > 5 ? "stale" : place.lifecycleTrend === "recovering" ? "recovering" : place.usePressureStatus === "overused" ? "worsening" as MemoryReferentFreshness : "repeated",
    status: `${campSeasonalIdentityLabel(place.seasonalIdentity)}, ${usePressureLabel(place.usePressureStatus)}`,
    currentResponse: response,
    consequences: [
      place.ecologicalPressure >= 0.35 ? "Overuse can lower health, cleanliness, or returns here." : undefined,
      place.ecologicalRecovery >= 0.35 ? "The place is recovering when pressure eases." : undefined,
      place.crossingUseScore >= 0.18 ? "Crossing memory helps explain why people return." : undefined,
      place.deathsWhileAnchoredLast10Years > 0 ? "Deaths while anchored make the place heavier in memory." : undefined,
      place.storageProcessingScore > 0.25 ? "Processing traces are plausible here, but no storage economy exists." : "No storage infrastructure is recorded.",
    ].filter(isString),
    relatedPlaceIds: [place.tileId],
    sourceTabs: ["overview", "place", "survival", "chronicle"],
    score: 30 + place.campLikeScore * 28 + place.visitCount * 2 + place.ecologicalPressure * 12 + place.crossingUseScore * 12,
    rawSourceLabels: ["Band.protoCampMemory"],
    rawIds: [String(place.tileId), place.campLikeState, place.lifecycleTrend, place.usePressureStatus],
    sourceReasonIds: place.reasonIds,
    scoringReasons: ["camp-like score", "visit count", "use pressure", "crossing score"],
  };
}

function routeReferent(context: ReferentContext, route: TravelCorridorMemory): ReferentDraft {
  const intents = route.intentKinds.map(intentKindLabel);
  const place = placeLabel(context, route.fromTileId);
  return {
    id: `route:${String(context.band.id)}:${String(route.id)}`,
    kind: "route",
    title: `Remembered route ${place ?? "through known country"}`,
    shortLabel: "Remembered route",
    summary: joinSentences([
      `Often used to ${joinNaturalList(intents)}.`,
      `It has ${route.useCount} recorded use${plural(route.useCount)} and ${confidenceWord(route.confidence)} confidence.`,
    ]),
    placeLabel: place,
    year: route.lastUsedAt.year,
    season: route.lastUsedAt.season,
    lastSeen: `${capitalize(route.lastUsedAt.season)} Y${route.lastUsedAt.year}`,
    recurrence: `${route.useCount} recorded use${plural(route.useCount)}`,
    confidence: route.confidence,
    freshness: route.confidence >= 0.6 ? "repeated" : "uncertain",
    status: route.confidence >= 0.6 ? "familiar route" : "uncertain route",
    currentResponse: "The band uses the route as remembered guidance, but crossings, load, and weather can still block whole-band moves.",
    consequences: [
      route.intentKinds.includes("seek_better_water") ? "Water pressure has shaped this route." : undefined,
      route.intentKinds.includes("return_to_known_good_area") ? "Returning to familiar ground is part of its use." : undefined,
    ].filter(isString),
    relatedPlaceIds: [route.fromTileId, route.toTileId],
    relatedRouteIds: [route.id],
    sourceTabs: ["doing", "place", "chronicle"],
    score: 25 + route.useCount * 2 + route.confidence * 22,
    rawSourceLabels: ["Band.travelCorridors"],
    rawIds: [String(route.id), ...route.intentKinds],
    scoringReasons: ["corridor use count", "route confidence", "movement intents"],
  };
}

function talkItemReferent(context: ReferentContext, item: CampRumorReadabilityItem, year: number, season: Season): ReferentDraft {
  const place = item.relatedTileId === undefined ? undefined : placeLabel(context, item.relatedTileId);
  return {
    id: `talk:${String(context.band.id)}:${item.id}`,
    kind: "talk_source",
    title: talkTitle(item),
    shortLabel: talkTitle(item),
    summary: joinSentences([
      cleanPlayerText(item.summary),
      item.occurrenceCount > 1 ? `People have repeated this ${item.occurrenceCount} time${plural(item.occurrenceCount)}.` : undefined,
    ]),
    placeLabel: place,
    year,
    season,
    recurrence: item.occurrenceCount > 1 ? `${item.occurrenceCount} mentions` : "single active talk item",
    confidence: item.salience === "high" ? 0.8 : item.salience === "medium" ? 0.55 : 0.35,
    freshness: item.compressedRepeatCount > 0 ? "repeated" : "recent",
    status: `${talkCategoryLabel(item.category)} talk`,
    currentResponse: responseForTalk(item.category),
    consequences: [
      item.whyShown,
      item.compressedRepeatCount > 0 ? "Repeated talk is compressed instead of shown as separate duplicate lines." : undefined,
    ].filter(isString).map(cleanPlayerText),
    relatedTalkIds: [item.id],
    relatedPlaceIds: item.relatedTileId === undefined ? [] : [item.relatedTileId],
    relatedBandIds: item.relatedBandId === undefined ? [] : [item.relatedBandId],
    sourceTabs: ["overview", "people", "chronicle"],
    score: 18 + item.occurrenceCount * 3 + (item.salience === "high" ? 18 : item.salience === "medium" ? 10 : 4),
    rawSourceLabels: ["Band.campRumors.items"],
    rawIds: [item.id, item.category, item.stateKey],
    sourceReasonIds: item.reasonIds,
    scoringReasons: ["talk salience", "occurrence count", "compressed repeats"],
  };
}

function talkLedgerReferent(context: ReferentContext, record: CampTalkRepetitionRecord, year: number, season: Season): ReferentDraft {
  const place = record.relatedTileId === undefined ? undefined : placeLabel(context, record.relatedTileId);
  return {
    id: `talk-ledger:${String(context.band.id)}:${record.stateKey}`,
    kind: "talk_source",
    title: `${talkCategoryLabel(record.sourceCategory)} repeated in camp`,
    shortLabel: `${talkCategoryLabel(record.sourceCategory)} talk`,
    summary: joinSentences([
      cleanPlayerText(record.lastSummary),
      `It has been remembered ${record.count} time${plural(record.count)}; ${record.suppressedCount} duplicate mention${plural(record.suppressedCount)} were compressed.`,
    ]),
    placeLabel: place,
    year,
    season,
    recurrence: `${record.count} mentions`,
    confidence: record.salience === "high" ? 0.8 : record.salience === "medium" ? 0.55 : 0.35,
    freshness: "repeated",
    status: "repeated talk",
    currentResponse: responseForTalk(record.sourceCategory),
    consequences: [
      record.suppressedCount > 0 ? "The UI treats this as one repeated memory, not duplicate chatter." : undefined,
    ].filter(isString),
    relatedTalkIds: [record.stateKey],
    relatedPlaceIds: record.relatedTileId === undefined ? [] : [record.relatedTileId],
    relatedBandIds: record.relatedBandId === undefined ? [] : [record.relatedBandId],
    sourceTabs: ["overview", "people", "chronicle"],
    score: 20 + record.count * 2 + record.suppressedCount,
    rawSourceLabels: ["Band.campRumors.repetitionLedger"],
    rawIds: [record.stateKey, record.sourceCategory, record.family],
    sourceReasonIds: record.reasonIds,
    scoringReasons: ["talk recurrence", "duplicate compression"],
  };
}

function materializeReferent(draft: ReferentDraft): MemoryReferent {
  const relatedEventIds = capArray(draft.relatedEventIds ?? [], RELATED_ID_CAP);
  const relatedTalkIds = capArray(draft.relatedTalkIds ?? [], RELATED_ID_CAP);
  const relatedPlaceIds = capArray(draft.relatedPlaceIds ?? [], RELATED_ID_CAP);
  const relatedResourceIds = capArray(draft.relatedResourceIds ?? [], RELATED_ID_CAP);
  const relatedRouteIds = capArray(draft.relatedRouteIds ?? [], RELATED_ID_CAP);
  const relatedBandIds = capArray(draft.relatedBandIds ?? [], RELATED_ID_CAP);
  const proofReasonIds = capReasonIds(draft.sourceReasonIds ?? []);
  const proofEventIds = capArray(relatedEventIds, PROOF_ID_CAP);
  const proofTalkIds = capArray(relatedTalkIds, PROOF_ID_CAP);
  const technicalProof: MemoryReferentTechnicalProof = {
    rawSourceLabels: capArray(draft.rawSourceLabels, PROOF_ID_CAP),
    rawIds: capArray(draft.rawIds ?? [], PROOF_ID_CAP),
    sourceReasonIds: proofReasonIds,
    sourceEventIds: proofEventIds,
    sourceTalkIds: proofTalkIds,
    score: round2(draft.score),
    scoringReasons: capArray(draft.scoringReasons, PROOF_ID_CAP),
    sourceKind: draft.kind,
  };

  return {
    id: draft.id,
    kind: draft.kind,
    title: cleanPlayerText(draft.title),
    shortLabel: cleanPlayerText(draft.shortLabel),
    summary: cleanPlayerText(draft.summary),
    ...(draft.placeLabel === undefined ? {} : { placeLabel: cleanPlayerText(draft.placeLabel) }),
    ...(draft.year === undefined ? {} : { year: draft.year }),
    ...(draft.season === undefined ? {} : { season: draft.season }),
    ...(draft.firstSeen === undefined ? {} : { firstSeen: cleanPlayerText(draft.firstSeen) }),
    ...(draft.lastSeen === undefined ? {} : { lastSeen: cleanPlayerText(draft.lastSeen) }),
    ...(draft.recurrence === undefined ? {} : { recurrence: cleanPlayerText(draft.recurrence) }),
    confidenceWord: confidenceWord(draft.confidence),
    freshness: draft.freshness,
    status: cleanPlayerText(draft.status),
    currentResponse: cleanPlayerText(draft.currentResponse ?? "No clear response yet."),
    consequences: capArray((draft.consequences ?? []).map(cleanPlayerText).filter((line) => line.length > 0), 5),
    relatedEventIds,
    relatedTalkIds,
    relatedPlaceIds,
    relatedResourceIds,
    relatedRouteIds,
    relatedBandIds,
    relatedReadableSources: capArray((draft.relatedReadableSources ?? []).map(cleanPlayerText), RELATED_ID_CAP),
    sourceTabs: draft.sourceTabs,
    linkTargetId: `referent:${draft.id}`,
    score: round2(draft.score),
    technicalProof,
  };
}

function dedupeDrafts(drafts: readonly ReferentDraft[]): readonly ReferentDraft[] {
  const byId = new Map<string, ReferentDraft>();
  for (const draft of drafts) {
    const existing = byId.get(draft.id);
    if (existing === undefined || draft.score > existing.score) {
      byId.set(draft.id, draft);
    }
  }
  return [...byId.values()];
}

function capDrafts(drafts: readonly ReferentDraft[]): { readonly kept: readonly ReferentDraft[]; readonly droppedByKindCap: number; readonly droppedByTotalCap: number } {
  const byKind = new Map<MemoryReferentKind, number>();
  const kindCapped: ReferentDraft[] = [];
  let droppedByKindCap = 0;

  for (const draft of drafts) {
    const count = byKind.get(draft.kind) ?? 0;
    if (count >= PER_KIND_CAP) {
      droppedByKindCap += 1;
      continue;
    }
    byKind.set(draft.kind, count + 1);
    kindCapped.push(draft);
  }

  const kept = kindCapped.slice(0, TOTAL_REFERENT_CAP);
  return {
    kept,
    droppedByKindCap,
    droppedByTotalCap: Math.max(0, kindCapped.length - kept.length),
  };
}

function compareDrafts(left: ReferentDraft, right: ReferentDraft): number {
  return right.score - left.score || kindRank(left.kind) - kindRank(right.kind) || left.id.localeCompare(right.id);
}

function kindRank(kind: MemoryReferentKind): number {
  const order: readonly MemoryReferentKind[] = [
    "accident",
    "sickness_source",
    "weather_episode",
    "gear_material_issue",
    "food_patch",
    "resource_place",
    "camp_place",
    "crossing",
    "route",
    "animal_sign",
    "aquatic_place",
    "forest_place",
    "access_place",
    "social_relation",
    "talk_source",
    "event_source",
  ];
  return order.indexOf(kind);
}

function countByKind(referents: readonly MemoryReferent[]): Readonly<Record<MemoryReferentKind, number>> {
  const counts: Record<MemoryReferentKind, number> = { ...EMPTY_KIND_COUNTS };
  for (const referent of referents) {
    counts[referent.kind] += 1;
  }
  return counts;
}

function buildCompressedNotices(band: Band, referents: readonly MemoryReferent[]): readonly string[] {
  const notices: string[] = [];
  const fallbackCount = referents.filter((referent) =>
    referent.kind === "food_patch" &&
    /fallback|hunger|emergency|testing/i.test(`${referent.summary} ${referent.status} ${referent.currentResponse}`),
  ).length;
  if (fallbackCount >= 2 || (band.campRumors?.repetitionLedger ?? []).some((record) => /fallback|hunger|risk/i.test(record.lastSummary) && record.count > 1)) {
    notices.push("Hunger is repeatedly pushing the band toward risky or costly fallback foods; duplicate warnings are compressed into the concrete patches below.");
  }
  const repeatedTalk = (band.campRumors?.repetitionLedger ?? []).filter((record) => record.suppressedCount > 0).length;
  if (repeatedTalk > 0) {
    notices.push(`${repeatedTalk} repeated talk theme${plural(repeatedTalk)} are shown as remembered themes instead of duplicate lines.`);
  }
  return notices.slice(0, 3);
}

function weatherPlaceLabel(context: ReferentContext, memory: WeatherMemoryRecord): string | undefined {
  if (memory.kind === "bad_crossing_season" || memory.kind === "wet_travel") {
    const crossing = Object.values(context.band.crossingMemories)[0];
    if (crossing !== undefined) {
      return placeLabel(context, crossing.crossingTileA);
    }
  }
  return placeLabel(context, context.band.position);
}

function placeTileIdsForWeather(band: Band): readonly TileId[] {
  const crossing = Object.values(band.crossingMemories)[0];
  return crossing === undefined ? [band.position] : [band.position, crossing.crossingTileA, crossing.crossingTileB];
}

function placeLabel(context: ReferentContext, tileId: TileId | undefined): string | undefined {
  if (tileId === undefined) {
    return undefined;
  }

  const { band, world } = context;
  const camp = band.protoCampMemory?.places[tileId];
  const access = band.protoAccessMemory?.places[tileId];
  const direction = directionFromCurrent(world, band.position, tileId);

  if (String(tileId) === String(band.position)) {
    return "near the current camp";
  }
  if (camp !== undefined && camp.campLikeState !== "none") {
    return `${relativePlacePhrase(direction)}, at ${articleFor(campStateLabel(camp.campLikeState))} ${campStateLabel(camp.campLikeState).toLowerCase()}`;
  }
  if (access !== undefined && access.accessState !== "none") {
    return `${relativePlacePhrase(direction)}, at a remembered ${accessPlaceTypeLabel(access.placeType)}`;
  }
  if (Object.values(band.crossingMemories).some((memory) => memory.crossingTileA === tileId || memory.crossingTileB === tileId)) {
    return `${relativePlacePhrase(direction)}, at a remembered crossing`;
  }
  return relativePlacePhrase(direction);
}

function directionFromCurrent(world: WorldState, currentTileId: TileId, targetTileId: TileId): string {
  const current = world.tiles[currentTileId];
  const target = world.tiles[targetTileId];
  if (current === undefined || target === undefined) {
    return "nearby";
  }

  const dx = target.coord.x - current.coord.x;
  const dy = target.coord.y - current.coord.y;
  if (dx === 0 && dy === 0) {
    return "near";
  }

  const eastWest = dx > 1 ? "east" : dx < -1 ? "west" : "";
  const northSouth = dy > 1 ? "south" : dy < -1 ? "north" : "";
  const direction = `${northSouth}${northSouth.length > 0 && eastWest.length > 0 ? "-" : ""}${eastWest}`;
  return direction.length > 0 ? direction : "nearby";
}

function shortPlaceSuffix(place: string | undefined): string {
  if (place === undefined) {
    return "place";
  }
  if (place.includes("current camp")) {
    return "near camp";
  }
  if (place.includes("crossing")) {
    return "at crossing";
  }
  if (place.includes("east")) {
    return "east";
  }
  if (place.includes("west")) {
    return "west";
  }
  if (place.includes("north")) {
    return "north";
  }
  if (place.includes("south")) {
    return "south";
  }
  return "place";
}

function relativePlacePhrase(direction: string): string {
  return direction === "near" || direction === "nearby" ? "near the current camp" : `${direction} of the current camp`;
}

function weatherTitle(kind: string, band: Band): string {
  switch (kind) {
    case "cold_exposure":
      return "cold near camp";
    case "heat_drought":
      return "dry heat";
    case "wet_travel":
      return "wet travel";
    case "bad_crossing_season":
      return Object.keys(band.crossingMemories).length > 0 ? "crossing weather" : "bad crossing weather";
    case "dry_water_stress":
      return "dry water stress";
    case "floodplain_wetland":
      return "flooding ground";
    default:
      return cleanPlayerText(kind);
  }
}

function weatherSummary(kind: string, place: string | undefined): string {
  const where = place ?? "in remembered country";
  switch (kind) {
    case "cold_exposure":
      return `Cold spells ${where} increased fire, shelter, and care pressure.`;
    case "heat_drought":
      return `Heat and dry spells ${where} made water access more important.`;
    case "wet_travel":
      return `Wet travel ${where} made carrying and movement harder.`;
    case "bad_crossing_season":
      return `Wet ground and river conditions ${where} made whole-band crossing harder.`;
    case "dry_water_stress":
      return `Dry water stress ${where} reduced willingness to leave known water.`;
    case "floodplain_wetland":
      return `Flooding ground ${where} made wetland use helpful but risky.`;
    default:
      return `${cleanPlayerText(kind)} mattered ${where}.`;
  }
}

function weatherEffects(memory: WeatherMemoryRecord): string {
  const effects = [
    memory.routeCaution >= 0.25 ? "movement caution" : undefined,
    memory.fireNeed >= 0.25 ? "fire need" : undefined,
    memory.childElderRisk >= 0.25 ? "risk to dependents and elders" : undefined,
  ].filter(isString);
  return effects.length === 0 ? "The effect is remembered, but weak now." : `The remembered effects are ${joinNaturalList(effects)}.`;
}

function weatherConsequences(memory: WeatherMemoryRecord): readonly string[] {
  const consequences = [
    memory.routeCaution >= 0.35 ? "Whole-band movement is more cautious." : undefined,
    memory.fireNeed >= 0.35 ? "Fire and shelter work matter more." : undefined,
    memory.childElderRisk >= 0.35 ? "Dependents and elders are harder to move safely." : undefined,
  ].filter(isString);
  return consequences.length === 0
    ? ["No strong current consequence remains, but the episode is still part of the band's weather memory."]
    : consequences;
}

function weatherStatus(memory: WeatherMemoryRecord): string {
  if (memory.trend === "recovered") {
    return "recovered weather memory";
  }
  if (memory.trend === "fading") {
    return "fading weather memory";
  }
  if (memory.routeCaution >= 0.45) {
    return "movement caution active";
  }
  if (memory.fireNeed >= 0.45) {
    return "fire and shelter pressure";
  }
  return "weather memory active";
}

function responseForWeather(memory: WeatherMemoryRecord, band: Band): string {
  const tasks = band.bodyCampLogistics?.seasonalTasks ?? [];
  if ((memory.kind === "bad_crossing_season" || memory.kind === "wet_travel") && tasks.some((task) => task.category === "repair_materials")) {
    return "Repair materials are a seasonal task before another whole-band crossing feels safe.";
  }
  if (memory.kind === "cold_exposure" && tasks.some((task) => task.category === "winter_shelter_fire")) {
    return "The band is putting labor into winter shelter and fire.";
  }
  if ((memory.kind === "heat_drought" || memory.kind === "dry_water_stress") && tasks.some((task) => task.category === "dry_water_refuge")) {
    return "The band is holding closer to known dry-season water.";
  }
  if (memory.routeCaution >= 0.45) {
    return "Whole-band moves are delayed or made more cautiously.";
  }
  return "No clear response yet.";
}

function trendSentence(trend: string, staleness: number): string {
  if (trend === "reinforced") {
    return "The memory has been reinforced rather than forgotten.";
  }
  if (trend === "forming") {
    return "The memory is still forming.";
  }
  if (trend === "recovered") {
    return "Conditions have recovered enough that the memory is less urgent.";
  }
  if (staleness >= 0.55) {
    return "The memory is becoming stale.";
  }
  return "";
}

function freshnessFromTrend(trend: string, staleness: number): MemoryReferentFreshness {
  if (trend === "recovered") {
    return "recovering";
  }
  if (trend === "reinforced") {
    return "repeated";
  }
  if (staleness >= 0.55 || trend === "fading") {
    return "stale";
  }
  return "recent";
}

function gearCause(wear: MaterialWearRecord, band: Band): string {
  const weather = band.bodyCampLogistics?.weatherMemories ?? [];
  if (wear.category === "crossing_lashings" && weather.some((memory) => memory.kind === "bad_crossing_season" || memory.kind === "wet_travel")) {
    return "Recent wet travel and crossing memory strained lashings.";
  }
  if (wear.category === "cordage_fiber" && materialResourceIds(band).length > 0) {
    return "Cordage and fiber depend on seasonal material work.";
  }
  if (wear.category === "carrying_gear" && (band.bodyCampLogistics?.logisticCapacity.carryingLoad ?? 0) >= 0.45) {
    return "Heavy carrying and dependent load are wearing the gear.";
  }
  if (wear.materialBasis < 0.25) {
    return "Known repair material is weak or uncertain.";
  }
  return "Repeated daily work is wearing this material.";
}

function responseForGear(wear: MaterialWearRecord, band: Band): string {
  const logistics = band.bodyCampLogistics;
  if (logistics?.seasonalTasks.some((task) => task.category === "repair_materials")) {
    return "Repair material is already a seasonal task.";
  }
  if ((logistics?.logisticCapacity.spareAdultLabor ?? 1) < 0.25) {
    return "Too few spare adults are available to repair it quickly.";
  }
  if (wear.materialBasis < 0.25) {
    return "No strong known material source is nearby.";
  }
  if (wear.category === "crossing_lashings") {
    return "The band is likely to delay or reduce risky crossings until lashings improve.";
  }
  if (wear.condition === "recovering") {
    return "Repair is helping, but the constraint still matters.";
  }
  return "No clear response yet.";
}

function materialResourceIds(band: Band): readonly string[] {
  return (band.resourceEcology?.storageSuitabilityCards ?? [])
    .filter((card) => card.crossingMaterialUse !== "none" || card.protoCampRelevance === "material_place")
    .map((card) => card.classId)
    .slice(0, RELATED_ID_CAP);
}

function responseForSickness(sickness: SicknessWaveState, band: Band): string {
  if (band.bodyCampLogistics?.seasonalTasks.some((task) => task.category === "rest_recovery")) {
    return "Rest and recovery are seasonal work now.";
  }
  if (band.bodyCampLogistics?.campCleanliness.movementDebate !== undefined && band.bodyCampLogistics.campCleanliness.movementDebate >= 0.35) {
    return "Camp cleaning and movement debate are part of the response.";
  }
  if (sickness.travelCaution >= 0.35) {
    return "The band is moving more cautiously while care burden is high.";
  }
  return "No clear response yet.";
}

function responseForFallback(level: string, riskCost: number): string {
  if (level === "emergency") {
    return "Hunger is forcing emergency use despite remembered cost.";
  }
  if (level === "expanded") {
    return "The band is leaning on this fallback while returns stay poor.";
  }
  if (level === "testing") {
    return riskCost >= 0.3 ? "People are testing it cautiously because risk is remembered." : "People are testing it in small amounts.";
  }
  if (level === "watching") {
    return "People are watching it as a possible fallback.";
  }
  return "No clear response yet.";
}

function responseForResourceMemory(failureCount: number, pressure: number, overuseNote: string | undefined): string {
  if (pressure >= 0.45 || overuseNote !== undefined) {
    return "The band is likely to reduce trust in this source or shift pressure elsewhere.";
  }
  if (failureCount > 0) {
    return "People keep this source in memory, but failures make it less certain.";
  }
  return "The band can keep using this remembered source when the season fits.";
}

function responseForAcuteRisk(kind: string, band: Band): string {
  if (band.bodyCampLogistics?.seasonalTasks.some((task) => task.category === "rest_recovery")) {
    return "Rest and recovery are already part of this season's work.";
  }
  if (kind === "bad_water_sickness") {
    return "People are more cautious around bad water.";
  }
  if (kind === "aquatic_accident" || kind === "travel_accident") {
    return "Movement and crossings are more cautious afterward.";
  }
  if (kind === "exposure_or_cold_snap" || kind === "heat_or_drought_exhaustion") {
    return "The band stays closer to shelter, water, or known refuge.";
  }
  return "No clear response yet.";
}

function responseForCamp(place: ProtoCampPlaceMemory, band: Band): string {
  if (band.bodyCampLogistics?.campCleanliness.state === "recovering") {
    return "The camp is being cleaned up while people decide whether to stay.";
  }
  if (place.usePressureStatus === "overused") {
    return "People are more willing to shift pressure away if movement is possible.";
  }
  if (place.lifecycleTrend === "recovering") {
    return "Resting the place is helping it recover.";
  }
  if (place.campLikeState === "crossing_camp") {
    return "The band returns for the familiar route, but crossing risk still matters.";
  }
  return "No clear response yet.";
}

function talkTitle(item: CampRumorReadabilityItem): string {
  const summary = cleanPlayerText(item.summary);
  const firstSentence = summary.split(/[.!?]/)[0] ?? summary;
  return firstSentence.length > 58 ? `${firstSentence.slice(0, 55).trim()}...` : firstSentence;
}

function responseForTalk(category: string): string {
  switch (category) {
    case "movement":
      return "Talk is reinforcing caution about where to move.";
    case "plants":
    case "aquatic":
    case "adaptation":
      return "Talk is shaping what people test, use, or avoid for food.";
    case "body_logistics":
      return "Talk is keeping repair, carrying, care, or sickness visible.";
    case "camp_place":
      return "Talk is keeping a place memory active.";
    case "access_norms":
      return "Talk is shaping watchfulness around shared use.";
    default:
      return "The talk records what people notice and repeat.";
  }
}

function responseForEventCategory(category: string): string {
  switch (category) {
    case "movement":
      return "The event now shapes route memory and movement caution.";
    case "survival":
    case "resource_ecology":
    case "adaptation":
      return "The event helps explain current food, water, or resource choices.";
    case "body_logistics":
      return "The event helps explain current care, gear, or camp burdens.";
    case "camp_place":
      return "The event helps explain why a place matters.";
    case "relationship_memory":
    case "social_tension":
    case "access_norms":
      return "The event helps explain social memory and caution.";
    default:
      return "The event remains part of the band's remembered history.";
  }
}

function whyReturnToCamp(place: ProtoCampPlaceMemory): string | undefined {
  const reasons = [
    place.waterRefugeReliability >= 0.35 ? "water or refuge" : undefined,
    place.crossingUseScore >= 0.18 ? "a familiar crossing route" : undefined,
    place.activitySuccessCountNearby > place.activityFailureCountNearby ? "nearby successful work" : undefined,
    place.knownKinContactNearby >= 0.3 ? "known people nearby" : undefined,
  ].filter(isString);
  return reasons.length === 0 ? undefined : `Why they return: ${joinNaturalList(reasons)}.`;
}

function whyCampFragile(place: ProtoCampPlaceMemory): string | undefined {
  const reasons = [
    place.ecologicalPressure >= 0.35 ? "overuse" : undefined,
    place.deathMemoryNearby >= 0.25 ? "death memory" : undefined,
    place.migrationHardshipLinkedToLeaving >= 0.35 ? "hard movement away" : undefined,
    place.socialCrowdingPressureNearby >= 0.35 ? "crowding" : undefined,
  ].filter(isString);
  return reasons.length === 0 ? undefined : `Why it is fragile: ${joinNaturalList(reasons)}.`;
}

function accidentOutcomeLine(episode: {
  readonly affectedActivityEfficiency: boolean;
  readonly affectedMortalityPressure: boolean;
  readonly affectedMovementCaution: boolean;
  readonly affectedStress: boolean;
}): string {
  const known = [
    episode.affectedActivityEfficiency ? "activity loss" : undefined,
    episode.affectedMovementCaution ? "movement caution" : undefined,
    episode.affectedStress ? "stress" : undefined,
    episode.affectedMortalityPressure ? "mortality pressure" : "no direct death record",
  ].filter(isString);
  return `Known outcomes: ${joinNaturalList(known)}.`;
}

function isDifficultCrossingResult(result: string): boolean {
  return result === "crossing_delayed_materials" ||
    result === "crossing_abandoned_risk" ||
    result === "crossing_partial_success" ||
    result === "materials_missing";
}

function crossingResultLabel(result: string): string {
  switch (result) {
    case "materials_missing":
      return "failed because known material was missing";
    case "crossing_delayed_materials":
      return "was delayed by material, labor, or load";
    case "crossing_abandoned_risk":
      return "was abandoned because the crossing felt too risky";
    case "crossing_partial_success":
      return "partly worked but slowed the move";
    case "crossing_success":
      return "worked";
    default:
      return cleanPlayerText(result);
  }
}

function yearFromTick(tick: TickNumber): number {
  return Math.floor(Number(tick) / 4);
}

function uniquePlaces(places: readonly ProtoCampPlaceMemory[]): readonly ProtoCampPlaceMemory[] {
  const byTile = new Map<string, ProtoCampPlaceMemory>();
  for (const place of places) {
    const key = String(place.tileId);
    const existing = byTile.get(key);
    if (existing === undefined || place.campLikeScore > existing.campLikeScore) {
      byTile.set(key, place);
    }
  }
  return [...byTile.values()].sort((left, right) => right.campLikeScore - left.campLikeScore || String(left.tileId).localeCompare(String(right.tileId)));
}

function uniqueAccessPlaces(places: readonly ProtoAccessMemory[]): readonly ProtoAccessMemory[] {
  const byTile = new Map<string, ProtoAccessMemory>();
  for (const place of places) {
    const key = String(place.tileId);
    const existing = byTile.get(key);
    if (existing === undefined || place.accessImportance > existing.accessImportance) {
      byTile.set(key, place);
    }
  }
  return [...byTile.values()].sort((left, right) => right.accessImportance - left.accessImportance || String(left.tileId).localeCompare(String(right.tileId)));
}

function cleanPlayerText(value: string | undefined): string {
  if (value === undefined) {
    return "";
  }
  return value
    .replace(/\b(?:tile|band|reason|decision|event|stock|patch|route|river):[a-z0-9:_-]+/gi, "")
    .replace(/\b[a-z]+_[a-z0-9_]+\b/gi, (match) => match.split("_").join(" "))
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/[|]\s*$/g, "")
    .trim();
}

function joinSentences(parts: readonly (string | undefined)[]): string {
  return parts
    .map(cleanPlayerText)
    .filter((part) => part.length > 0)
    .map((part) => /[.!?]$/.test(part) ? part : `${part}.`)
    .join(" ");
}

function joinNaturalList(items: readonly string[]): string {
  const unique = uniqueStrings(items.map(cleanPlayerText).filter((item) => item.length > 0));
  if (unique.length === 0) {
    return "known memory";
  }
  if (unique.length === 1) {
    return unique[0] ?? "known memory";
  }
  if (unique.length === 2) {
    return `${unique[0]} and ${unique[1]}`;
  }
  return `${unique.slice(0, -1).join(", ")}, and ${unique[unique.length - 1]}`;
}

function capReasonIds(reasonIds: readonly ReasonId[]): readonly ReasonId[] {
  const out: ReasonId[] = [];
  const seen = new Set<string>();
  for (const reasonId of reasonIds) {
    const key = String(reasonId);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(reasonId);
    if (out.length >= PROOF_ID_CAP) {
      break;
    }
  }
  return out;
}

function capArray<T>(items: readonly T[], cap: number): readonly T[] {
  return items.slice(0, cap);
}

function uniqueStrings(items: readonly string[]): readonly string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item)) {
      continue;
    }
    seen.add(item);
    out.push(item);
  }
  return out;
}

function byteLengthUtf8(value: string): number {
  return new TextEncoder().encode(value).length;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function plural(count: number): string {
  return count === 1 ? "" : "s";
}

function countNoun(count: number, singular: string, pluralForm?: string): string {
  return `${count} ${count === 1 ? singular : pluralForm ?? `${singular}s`}`;
}

function capitalize(value: string): string {
  const cleaned = cleanPlayerText(value);
  return cleaned.length === 0 ? cleaned : cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function articleFor(value: string): string {
  return /^[aeiou]/i.test(value) ? "an" : "a";
}

function confidenceWord(value: number | undefined): string {
  if (value === undefined || Number.isNaN(value)) {
    return "unknown";
  }
  if (value < 0.25) {
    return "barely known";
  }
  if (value < 0.5) {
    return "uncertain";
  }
  if (value < 0.75) {
    return "fairly sure";
  }
  return "well known";
}

function intensityWord(value: number | undefined): string {
  if (value === undefined || Number.isNaN(value)) {
    return "unknown";
  }
  if (value < 0.12) {
    return "barely felt";
  }
  if (value < 0.32) {
    return "mild";
  }
  if (value < 0.55) {
    return "noticeable";
  }
  if (value < 0.78) {
    return "strong";
  }
  return "severe";
}

function fallbackStatus(level: string): string {
  switch (level) {
    case "watching":
      return "watched fallback";
    case "testing":
      return "cautious testing";
    case "expanded":
      return "fallback in use";
    case "emergency":
      return "emergency fallback";
    default:
      return "fallback not active";
  }
}

function laborRiskPhrase(labor: number, risk: number): string {
  const laborWord = labor >= 0.55 ? "heavy to work or carry" : labor >= 0.32 ? "some work to use" : "not too costly to use";
  const riskWord = risk >= 0.45 ? "risky" : risk >= 0.25 ? "somewhat risky" : "not strongly risky";
  return `${laborWord} and ${riskWord}`;
}

function resourceLabel(classId: string): string {
  switch (classId) {
    case "generic_plant_food":
      return "plant food";
    case "fallback_food":
    case "fallback_foods":
      return "fallback food";
    case "roots_tubers_fallback":
      return "roots and tubers";
    case "wetland_plant_food":
      return "wetland plant food";
    case "aquatic_food":
      return "water-edge food";
    case "fish_or_shellfish":
      return "fish or shellfish";
    case "wild_grain_patch":
      return "wild grain";
    case "reed_fiber":
      return "reed and fiber";
    default:
      return cleanPlayerText(classId);
  }
}

function cleanResourceLabel(label: string): string {
  return cleanPlayerText(label.replace(/\s*\/\s*/g, " and "));
}

function learningStatusLabel(status: string): string {
  switch (status) {
    case "not_known":
      return "not known yet";
    case "suspected":
      return "suspected";
    case "watched":
      return "being watched";
    case "cautiously_known":
      return "cautiously known";
    case "known_useful":
      return "known and useful";
    case "known_poor":
      return "known to be poor";
    case "known_risky":
      return "known to be risky";
    default:
      return cleanPlayerText(status);
  }
}

function gearLabel(category: string): string {
  switch (category) {
    case "carrying_gear":
      return "Carrying gear";
    case "cordage_fiber":
      return "Cordage and fiber";
    case "containers_wraps":
      return "Containers and wraps";
    case "hunting_gear":
      return "Hunting gear";
    case "fishing_gear":
      return "Fishing gear";
    case "fire_processing_material":
      return "Fire and processing kit";
    case "crossing_lashings":
      return "Crossing lashings";
    default:
      return cleanPlayerText(category);
  }
}

function wearConditionLabel(condition: string): string {
  switch (condition) {
    case "good":
      return "in good shape";
    case "worn":
      return "worn";
    case "strained":
      return "badly worn";
    case "failing":
      return "failing";
    case "recovering":
      return "being repaired";
    default:
      return cleanPlayerText(condition);
  }
}

function sicknessCauseLabel(cause: string): string {
  switch (cause) {
    case "bad_water":
      return "bad water";
    case "spoiled_food":
      return "spoiled food";
    case "risky_fallback_food":
      return "risky fallback food";
    case "cold_exposure":
      return "cold and exposure";
    case "heat_stress":
      return "heat";
    case "camp_waste":
      return "camp waste";
    case "crowding":
      return "crowding";
    case "poor_diet":
      return "a poor diet";
    case "wetland_insects":
      return "wetland insects";
    default:
      return cleanPlayerText(cause);
  }
}

function acuteKindLabel(kind: string): string {
  switch (kind) {
    case "minor_foraging_injury":
      return "minor foraging injury";
    case "severe_foraging_injury":
      return "serious foraging injury";
    case "bad_water_sickness":
      return "bad-water sickness";
    case "spoiled_or_risky_food_sickness":
      return "risky-food sickness";
    case "plant_poisoning_or_irritation":
      return "bad plant reaction";
    case "aquatic_accident":
      return "water-crossing accident";
    case "animal_encounter_injury":
      return "animal encounter injury";
    case "exposure_or_cold_snap":
      return "cold exposure";
    case "heat_or_drought_exhaustion":
      return "heat exhaustion";
    case "travel_accident":
      return "travel accident";
    default:
      return cleanPlayerText(kind);
  }
}

function severityLabel(severity: string): string {
  switch (severity) {
    case "critical":
      return "critical";
    case "severe":
      return "severe";
    case "moderate":
      return "moderate";
    case "minor":
      return "minor";
    default:
      return cleanPlayerText(severity);
  }
}

function severityScore(severity: string): number {
  switch (severity) {
    case "critical":
      return 1;
    case "severe":
      return 0.8;
    case "moderate":
      return 0.55;
    case "minor":
      return 0.25;
    default:
      return 0.35;
  }
}

function campStateLabel(state: string): string {
  switch (state) {
    case "repeated_stop":
      return "repeated stopping place";
    case "seasonal_return_place":
      return "seasonal return place";
    case "refuge_anchor":
      return "refuge anchor";
    case "activity_base":
      return "activity base";
    case "remnant_holdout":
      return "remnant holdout";
    case "storage_processing_candidate":
      return "processing candidate";
    case "crossing_camp":
      return "crossing camp";
    case "fragile_camp_like_place":
      return "fragile camp-like place";
    case "contested_camp_like_place":
      return "shared-use camp-like place";
    case "stale_remembered_camp":
      return "stale remembered camp";
    case "persistent_camp_candidate":
      return "persistent camp candidate";
    case "proto_camp_candidate":
      return "camp candidate";
    case "abandoned_camp_trace":
      return "abandoned camp trace";
    default:
      return "remembered place";
  }
}

function campTrendLabel(trend: string): string {
  switch (trend) {
    case "new":
      return "newly noticed";
    case "strengthening":
      return "growing in importance";
    case "weakening":
      return "losing importance";
    case "recovering":
      return "recovering";
    case "stale":
      return "fading from memory";
    case "stable":
      return "holding steady";
    default:
      return cleanPlayerText(trend);
  }
}

function campSeasonalIdentityLabel(identity: string): string {
  switch (identity) {
    case "dry_refuge_return":
      return "dry-season refuge";
    case "wet_spread_place":
      return "wet-season spreading ground";
    case "winter_shelter":
      return "winter shelter";
    case "spring_pulse_camp":
      return "spring-flush camp";
    case "autumn_processing_candidate":
      return "autumn processing spot";
    case "seasonal_crossing_camp":
      return "seasonal crossing camp";
    case "general_return_place":
      return "general return place";
    default:
      return cleanPlayerText(identity);
  }
}

function usePressureLabel(status: string): string {
  switch (status) {
    case "low":
      return "lightly used";
    case "worn":
      return "showing wear";
    case "overused":
      return "overused";
    case "recovering":
      return "recovering from use";
    default:
      return cleanPlayerText(status);
  }
}

function accessPlaceTypeLabel(type: string): string {
  switch (type) {
    case "water_source":
      return "water source";
    case "ford_crossing":
      return "ford or crossing";
    case "wetland_fish_place":
      return "wetland fishing place";
    case "plant_patch":
      return "plant patch";
    case "hunting_route":
      return "hunting route";
    case "forest_refuge":
      return "forest refuge";
    case "storage_processing_candidate":
      return "processing candidate";
    case "persistent_camp":
      return "persistent camp candidate";
    case "seasonal_return_place":
      return "seasonal return place";
    case "dry_refuge":
      return "dry refuge";
    case "activity_base":
      return "activity base";
    default:
      return cleanPlayerText(type);
  }
}

function accessStateLabel(state: string): string {
  switch (state) {
    case "familiar_use":
      return "familiar use";
    case "expected_return":
      return "expected return";
    case "tolerated_shared_use":
      return "tolerated shared use";
    case "kin_tolerated":
      return "kin tolerated";
    case "stranger_watchful":
      return "watchful around strangers";
    case "crowded_use":
      return "crowded shared use";
    case "contested_use":
      return "contested use";
    case "avoided_shared_use":
      return "avoided shared use";
    case "sensitive_place":
      return "sensitive place";
    case "stale_access_memory":
      return "stale access memory";
    default:
      return "no expectations formed";
  }
}

function routeKindLabel(kind: string): string {
  switch (kind) {
    case "known_ford":
      return "known ford";
    case "remembered_bank":
      return "remembered riverbank route";
    case "seasonal_detour":
      return "seasonal detour";
    case "known_resting_point":
      return "known resting point";
    case "lashing_spot":
      return "crossing lashing spot";
    case "water_stop":
      return "water stop";
    case "animal_path":
      return "animal path";
    case "bad_segment_avoided":
      return "avoided bad segment";
    case "worn_path":
      return "worn familiar path";
    default:
      return cleanPlayerText(kind);
  }
}

function routeStatusLabel(status: string): string {
  switch (status) {
    case "improving":
      return "getting easier";
    case "familiar":
      return "familiar";
    case "strained":
      return "getting harder";
    case "rewritten":
      return "recently rethought";
    case "stale":
      return "half-forgotten";
    default:
      return cleanPlayerText(status);
  }
}

function intentKindLabel(intent: string): string {
  switch (intent) {
    case "local_foraging":
      return "keep daily work near camp";
    case "follow_river_corridor":
      return "follow a river corridor";
    case "probe_wetland_or_lake":
      return "check wet ground";
    case "probe_coast":
      return "check the coast";
    case "seek_better_water":
      return "seek better water";
    case "return_to_known_good_area":
      return "return to familiar ground";
    case "seek_new_range":
      return "seek new range";
    case "avoid_risk":
      return "avoid remembered risk";
    case "cross_pass":
      return "cross a pass";
    case "frontier_dispersal":
      return "move toward new country";
    case "daughter_range_expansion":
      return "make room for a daughter band";
    case "expand_known_world":
      return "expand known country";
    default:
      return cleanPlayerText(intent);
  }
}

function reputationKindLabel(kind: string): string {
  switch (kind) {
    case "kin_like":
      return "feel like kin";
    case "helpful":
      return "have been helpful";
    case "tolerated_familiar":
      return "are familiar and tolerated";
    case "watchful":
      return "are watched carefully";
    case "takes_too_much":
      return "take too much";
    case "unreliable":
      return "are unreliable";
    case "support_link":
      return "are a source of support";
    case "stale_unknown":
      return "are barely remembered";
    default:
      return cleanPlayerText(kind);
  }
}

function aggregationTriggerLabel(trigger: string): string {
  switch (trigger) {
    case "fish_wetland_pulse":
      return "a wetland fish run";
    case "seed_mast_pulse":
      return "a heavy seed year";
    case "dry_water_refuge":
      return "shared dry-season water";
    case "known_crossing_bottleneck":
      return "a busy crossing";
    case "persistent_camp_identity":
      return "a well-known camp";
    case "support_need":
      return "need for support";
    case "familiar_bands":
      return "familiar bands nearby";
    default:
      return cleanPlayerText(trigger);
  }
}

function failureStoryLabel(kind: string): string {
  switch (kind) {
    case "bad_crossing":
      return "bad crossing memory";
    case "cold_route":
      return "cold route memory";
    case "risky_plant":
      return "risky plant memory";
    case "bad_water":
      return "bad water memory";
    case "failed_hunt_route":
      return "failed hunting route";
    case "animal_injury":
      return "animal injury memory";
    case "sickness_camp":
      return "sickness camp memory";
    case "dirty_camp":
      return "dirty camp memory";
    case "overuse_collapse":
      return "overuse memory";
    case "failed_support":
      return "failed support memory";
    case "failed_breakaway":
      return "failed breakaway memory";
    default:
      return cleanPlayerText(kind);
  }
}

function talkCategoryLabel(category: string): string {
  switch (category) {
    case "body_logistics":
      return "care and gear";
    case "camp_place":
      return "camp place";
    case "access_norms":
      return "shared-use";
    case "range_knowledge":
      return "range knowledge";
    case "acute_risk":
      return "hard moment";
    case "inner_fission":
      return "holding together";
    case "social_tension":
      return "social tension";
    default:
      return cleanPlayerText(category);
  }
}

function animalKnownnessLabel(knownness: string): string {
  switch (knownness) {
    case "tracks":
      return "tracks";
    case "recent_tracks":
      return "fresh tracks";
    case "sighting":
      return "a sighting";
    case "repeated_sighting":
      return "repeated sightings";
    case "successful_hunt":
      return "a successful hunt";
    case "failed_find":
      return "a failed search";
    case "stale_route":
      return "a stale route";
    case "danger_caution":
      return "danger caution";
    case "reliable_route":
      return "a reliable route";
    default:
      return cleanPlayerText(knownness);
  }
}

function animalUsefulnessLabel(usefulness: string): string {
  switch (usefulness) {
    case "low":
      return "of little use";
    case "useful":
      return "useful";
    case "promising":
      return "promising";
    case "high_value":
      return "highly valued";
    case "risky_value":
      return "valuable but risky";
    case "unreliable":
      return "unreliable";
    case "scarce":
      return "too scarce to count on";
    default:
      return cleanPlayerText(usefulness);
  }
}

function animalFamiliarityLabel(kind: string): string {
  switch (kind) {
    case "familiar_route":
      return "follow a familiar route";
    case "hard_to_catch":
      return "are hard to catch";
    case "wary_of_hunters":
      return "have grown wary of hunters";
    case "camp_nuisance":
      return "are a nuisance around camp";
    case "scavenger_risk":
      return "draw scavenger risk";
    case "dangerous_but_known":
      return "are dangerous but understood";
    case "tolerated_proximity":
      return "tolerate people nearby";
    case "unreliable":
      return "come and go unpredictably";
    default:
      return cleanPlayerText(kind);
  }
}

function abundanceLabel(abundance: string): string {
  switch (abundance) {
    case "scarce":
      return "scarce";
    case "low":
      return "thin on the ground";
    case "steady":
      return "steady";
    case "abundant":
      return "abundant";
    default:
      return cleanPlayerText(abundance);
  }
}

function aquaticEffectLabel(effect: string): string {
  switch (effect) {
    case "fish_pulse":
      return "seasonal fish pulse";
    case "winter_buffer":
      return "winter buffer";
    case "wetland_buffer":
      return "wetland buffer";
    case "overfished":
      return "overused water food";
    case "recovery":
      return "recovering water food";
    case "poor_water_food":
      return "poor water food";
    default:
      return "routine water food";
  }
}

function plantUseStatusLabel(status: string): string {
  switch (status) {
    case "used":
      return "being used";
    case "watched":
      return "being watched";
    case "suspected":
      return "suspected";
    case "avoided":
      return "avoided";
    case "overused":
      return "overused";
    case "stale":
      return "stale";
    default:
      return cleanPlayerText(status);
  }
}

function forestLabel(coverType: string): string {
  switch (coverType) {
    case "riparian":
      return "riparian stand";
    case "open_woodland":
      return "open woodland";
    case "closed_forest":
      return "denser forest";
    case "scrub":
      return "scrub edge";
    default:
      return cleanPlayerText(coverType);
  }
}

function forestTrendLabel(trend: string): string {
  switch (trend) {
    case "recovering":
      return "recovering";
    case "declining":
      return "declining";
    case "spreading":
      return "spreading";
    case "stable":
      return "stable";
    default:
      return cleanPlayerText(trend);
  }
}

function forestUsePhrase(card: { readonly visibilityEffect: number; readonly movementAccessEffect: number; readonly animalHabitatValue: number; readonly woodFuelMaterialHook: number; readonly shadeRefugeValue: number }): string {
  const uses = [
    card.visibilityEffect >= 0.45 ? "visibility" : undefined,
    card.movementAccessEffect >= 0.45 ? "travel access" : undefined,
    card.animalHabitatValue >= 0.45 ? "animal signs" : undefined,
    card.woodFuelMaterialHook >= 0.45 ? "fuel or repair material" : undefined,
    card.shadeRefugeValue >= 0.45 ? "shade or shelter" : undefined,
  ].filter(isString);
  return uses.length === 0 ? "It is remembered as background cover rather than a major resource." : `It matters for ${joinNaturalList(uses)}.`;
}

function isString(value: string | undefined): value is string {
  return value !== undefined && value.length > 0;
}

function isTileId(value: TileId | undefined): value is TileId {
  return value !== undefined;
}
