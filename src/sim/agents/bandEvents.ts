import type { BandId, EventId, ReasonId, TickNumber, TileId } from "../core/types";
import type { WorldState } from "../world/types";
import type {
  Band,
  BandConditionProfileState,
  BandEventCountSummary,
  BandEventHistoryState,
  BandEventLifetimeSummary,
  BandLineageReadabilityState,
  BandReadableEvent,
  BandReadableEventCategory,
  BandReadableEventSalience,
  CampTalkCategory,
  CampTalkRepetitionRecord,
  CampTalkSalience,
  CampTalkTone,
  CampRumorReadabilityItem,
  CampRumorReadabilityState,
  DeathCauseKind,
  DemographicChurnState,
  IntraSeasonTripRecord,
  ProtoAccessPlaceType,
  ProtoAccessStateKind,
  ProtoCampStateKind,
  ResidentialMoveEvent,
  SeasonalHungerClassification,
  SocialRelationCategory,
} from "./types";

const RECENT_EVENT_LIMIT = 48;
const LAST_10_YEAR_EVENT_LIMIT = 80;
const LAST_25_YEAR_EVENT_LIMIT = 120;
const MAX_EVENT_CANDIDATES_PER_TICK = 14;
const CAMP_TALK_ITEM_LIMIT = 10;
const CAMP_TALK_LEDGER_LIMIT = 64;

interface BandReadableEventCandidate {
  readonly category: BandReadableEventCategory;
  readonly salience: BandReadableEventSalience;
  readonly title: string;
  readonly description: string;
  readonly detail?: string;
  readonly stateKey: string;
  readonly rawSource: string;
  readonly rawReason: string;
  readonly sourceReasonIds: readonly ReasonId[];
  readonly relatedBandId?: BandId;
  readonly relatedTileId?: TileId;
  readonly repeatWindowTicks: number;
}

interface CampTalkCandidate {
  readonly category: CampTalkCategory;
  readonly family: string;
  readonly salience: CampTalkSalience;
  readonly tone: CampTalkTone;
  readonly sourceCategory: CampTalkCategory;
  readonly summary: string;
  readonly stateKey: string;
  readonly whyShown: string;
  readonly rawSource: string;
  readonly rawReason: string;
  readonly confidenceStatus: string;
  readonly interpretationKind: "direct_state" | "interpretation";
  readonly relatedBandId?: BandId;
  readonly relatedTileId?: TileId;
  readonly reasonIds: readonly ReasonId[];
  readonly cooldownTicks: number;
  readonly rankBonus?: number;
}

export function applyBandReadabilityContext(world: WorldState): WorldState {
  const bands = Object.values(world.bands)
    .sort(compareBands)
    .reduce<Record<string, Band>>((bandsById, band) => {
      bandsById[String(band.id)] = {
        ...band,
        eventHistory: advanceBandEventHistory(world, band),
        campRumors: deriveCampRumorReadability(world, band),
        conditionProfile: deriveBandConditionProfile(world, band),
        lineageReadability: deriveBandLineageReadability(world, band),
      };

      return bandsById;
    }, {});

  return {
    ...world,
    bands: bands as Readonly<Record<BandId, Band>>,
  };
}

export function advanceBandEventHistory(world: WorldState, band: Band): BandEventHistoryState {
  const prior = band.eventHistory;
  const candidates = [...deriveBandEventCandidates(world, band)]
    .sort(compareCandidates)
    .slice(0, MAX_EVENT_CANDIDATES_PER_TICK);
  const appended: BandReadableEvent[] = [];
  let duplicateSpamFiltered = prior?.duplicateSpamFiltered ?? 0;

  for (const candidate of candidates) {
    if (shouldAppendEvent(prior, candidate, world.time.tick)) {
      appended.push(makeReadableEvent(world, band, candidate));
    } else {
      duplicateSpamFiltered += 1;
    }
  }

  const previousRecent = prior?.recentEvents ?? [];
  const mergedRecent = [...uniqueEvents([...appended, ...previousRecent])].sort(compareEventsNewestFirst);
  const recentEvents = mergedRecent.slice(0, RECENT_EVENT_LIMIT);
  const droppedRecentEventCount =
    (prior?.droppedRecentEventCount ?? 0) + Math.max(0, mergedRecent.length - RECENT_EVENT_LIMIT);
  const allKnownEvents = [...uniqueEvents([
    ...appended,
    ...(prior?.recentEvents ?? []),
    ...(prior?.last10Years ?? []),
    ...(prior?.last25Years ?? []),
  ])].sort(compareEventsNewestFirst);
  const last10Years = allKnownEvents
    .filter((event) => world.time.year - event.year <= 10)
    .slice(0, LAST_10_YEAR_EVENT_LIMIT);
  const last25Years = allKnownEvents
    .filter((event) => world.time.year - event.year <= 25)
    .slice(0, LAST_25_YEAR_EVENT_LIMIT);

  return {
    bandId: band.id,
    lastUpdatedTick: world.time.tick,
    recentEvents,
    last10Years,
    last25Years,
    lifetimeSummary: updateLifetimeSummary(prior?.lifetimeSummary, appended),
    boundedEventLimit: RECENT_EVENT_LIMIT,
    droppedRecentEventCount,
    duplicateSpamFiltered,
    reasonIds: collectEventReasonIds(appended, prior?.reasonIds ?? []),
  };
}

export function deriveCampRumorReadability(
  world: WorldState,
  band: Band,
): CampRumorReadabilityState {
  const prior = band.campRumors;
  const candidates = [...deriveCampTalkCandidates(world, band)].sort(compareTalkCandidates);
  const priorLedger = new Map<string, CampTalkRepetitionRecord>();
  for (const record of prior?.repetitionLedger ?? []) {
    priorLedger.set(record.stateKey, record);
  }

  const items: CampRumorReadabilityItem[] = [];
  let suppressedRepeatCount = 0;
  for (const candidate of candidates) {
    const priorRecord = priorLedger.get(candidate.stateKey);
    const occurrenceCount = (priorRecord?.count ?? 0) + 1;
    const ticksSinceLast = priorRecord === undefined
      ? Number.POSITIVE_INFINITY
      : Number(world.time.tick) - Number(priorRecord.lastTick);
    const compressedRepeat = occurrenceCount >= 3 && (occurrenceCount === 3 || occurrenceCount % 4 === 0);
    const suppressedByCooldown =
      priorRecord !== undefined &&
      ticksSinceLast <= candidate.cooldownTicks &&
      candidate.salience !== "high" &&
      !compressedRepeat;

    priorLedger.set(candidate.stateKey, updateTalkLedgerRecord(world, candidate, priorRecord, suppressedByCooldown));
    if (suppressedByCooldown) {
      suppressedRepeatCount += 1;
      continue;
    }

    if (items.length >= CAMP_TALK_ITEM_LIMIT) {
      continue;
    }

    items.push(makeCampTalkItem(world, band, candidate, occurrenceCount, priorRecord?.suppressedCount ?? 0));
  }

  const repetitionLedger = [...priorLedger.values()]
    .sort(compareTalkLedgerRecords)
    .slice(0, CAMP_TALK_LEDGER_LIMIT);
  const droppedItemCount = Math.max(0, candidates.length - items.length - suppressedRepeatCount);
  const reasonIds = uniqueStrings([
    ...items.flatMap((item) => item.reasonIds.map(String)),
    ...(prior?.reasonIds ?? []).map(String),
  ]).slice(0, 24).map((value) => value as ReasonId);

  return {
    bandId: band.id,
    lastUpdatedTick: world.time.tick,
    items,
    itemCap: CAMP_TALK_ITEM_LIMIT,
    droppedItemCount,
    suppressedRepeatCount: (prior?.suppressedRepeatCount ?? 0) + suppressedRepeatCount,
    repetitionLedger,
    categoryCounts: updateCountSummary([], items.map((item) => item.category)),
    salienceCounts: updateCountSummary([], items.map((item) => item.salience)),
    grounded: true,
    note: "Grounded camp talk only: band-known state, memories, visible cues, reports, and activity traces. It is readout-only and does not create hidden knowledge, culture, law, territory, or leaders.",
    reasonIds,
  };
}

function deriveCampTalkCandidates(world: WorldState, band: Band): readonly CampTalkCandidate[] {
  const candidates: CampTalkCandidate[] = [];
  pushSurvivalTalk(candidates, world, band);
  pushWaterTalk(candidates, world, band);
  pushPlantTalk(candidates, world, band);
  pushAquaticTalk(candidates, world, band);
  pushForagingAdaptationTalk(candidates, world, band);
  pushBodyLogisticsTalk(candidates, world, band);
  pushRelationshipMemoryTalk(candidates, world, band);
  pushStorageTalk(candidates, world, band);
  pushForestTalk(candidates, world, band);
  pushFaunaTalk(candidates, world, band);
  pushAcuteRiskTalk(candidates, world, band);
  pushMovementTalk(candidates, world, band);
  pushProtoCampTalk(candidates, world, band);
  pushDemographyTalk(candidates, world, band);
  pushInnerFissionTalk(candidates, world, band);
  pushSocialTalk(candidates, world, band);
  pushAccessNormTalk(candidates, world, band);
  pushRangeKnowledgeTalk(candidates, world, band);
  pushEverydayTalk(candidates, world, band);

  return candidates.filter((candidate) =>
    candidate.summary.length > 0 &&
    candidate.rawSource.length > 0 &&
    candidate.rawReason.length > 0 &&
    candidate.reasonIds.length > 0
  );
}

function pushBodyLogisticsTalk(candidates: CampTalkCandidate[], world: WorldState, band: Band): void {
  const logistics = band.bodyCampLogistics;

  if (logistics === undefined || logistics.reasonIds.length === 0 || logistics.mode === "stable") {
    return;
  }

  const weather = logistics.weatherMemories[0];
  if (weather !== undefined && weather.strength >= 0.24) {
    candidates.push({
      category: "body_logistics",
      family: `weather-${weather.kind}`,
      salience: weather.strength >= 0.58 ? "medium" : "low",
      tone: weather.routeCaution >= 0.42 ? "watchful" : "practical",
      sourceCategory: "body_logistics",
      summary: selectGroundedTemplate(world, band, `talk:logistics:weather:${weather.kind}`, [
        weather.kind === "cold_exposure"
          ? "Cold-route memory is making this path feel costly."
          : weather.kind === "heat_drought" || weather.kind === "dry_water_stress"
            ? "Dry-season heat is making water-linked camps more attractive."
            : weather.kind === "bad_crossing_season"
              ? "A past hard crossing keeps the ford costly in memory."
              : "Wet ground is useful, but people remember how hard it is on bodies.",
        "The warning is from remembered hardship, not hidden weather truth.",
        weather.trend === "recovered"
          ? "The memory is fading after safer seasons."
          : `${weather.source}.`,
      ]),
      stateKey: `talk:logistics:weather:${weather.kind}:${weather.trend}:${stressBucket(weather.strength)}`,
      whyShown: "weather memory is salient for travel, fire, or child/elder burden",
      rawSource: "Band.bodyCampLogistics.weatherMemories",
      rawReason: `kind=${weather.kind}; strength=${round2(weather.strength)}; trend=${weather.trend}; route=${round2(weather.routeCaution)}; fireNeed=${round2(weather.fireNeed)}; source=${weather.source}`,
      confidenceStatus: `staleness ${round2(weather.staleness)}; child/elder risk ${round2(weather.childElderRisk)}`,
      interpretationKind: "interpretation",
      reasonIds: weather.sourceReasonIds,
      cooldownTicks: 10,
      rankBonus: weather.strength >= 0.58 ? 0.04 : 0,
    });
  }

  if (logistics.fire.status !== "not_relevant" && (logistics.fire.need >= 0.24 || logistics.fire.usefulness >= 0.18)) {
    candidates.push({
      category: "body_logistics",
      family: `fire-${logistics.fire.status}`,
      salience: logistics.fire.status === "risky" || logistics.fire.status === "limited_by_fuel" ? "medium" : "low",
      tone: logistics.fire.status === "risky" ? "watchful" : logistics.fire.status === "limited_by_fuel" || logistics.fire.status === "strained" ? "resigned" : "practical",
      sourceCategory: "body_logistics",
      summary: selectGroundedTemplate(world, band, `talk:logistics:fire:${logistics.fire.status}`, [
        logistics.fire.status === "limited_by_fuel"
          ? "Fire would help, but fuel work is rising near camp."
          : logistics.fire.status === "risky"
            ? "Dry conditions make fire useful and worrying at the same time."
            : "Fire helps with warmth, smoke, or processing, but it still costs labor.",
        "This is practical camp work, not a fixed path of advancement.",
        `Fuel basis is ${round2(logistics.fire.fuelBasis)} and labor cost is ${round2(logistics.fire.laborCost)}.`,
      ]),
      stateKey: `talk:logistics:fire:${logistics.fire.status}:${stressBucket(logistics.fire.need)}:${stressBucket(logistics.fire.fireRisk)}`,
      whyShown: "fire need, processing value, fuel pressure, or dry-risk cost is salient",
      rawSource: "Band.bodyCampLogistics.fire",
      rawReason: `status=${logistics.fire.status}; need=${round2(logistics.fire.need)}; usefulness=${round2(logistics.fire.usefulness)}; fuel=${round2(logistics.fire.fuelBasis)}; processing=${round2(logistics.fire.processingValue)}; fuelPressure=${round2(logistics.fire.fuelPressure)}; risk=${round2(logistics.fire.fireRisk)}`,
      confidenceStatus: `material confidence ${round2(logistics.fire.materialConfidence)}`,
      interpretationKind: "interpretation",
      reasonIds: logistics.fire.reasonIds,
      cooldownTicks: 10,
      rankBonus: logistics.fire.status === "risky" ? 0.05 : 0.02,
    });
  }

  if (logistics.sickness.active) {
    candidates.push({
      category: "body_logistics",
      family: "sickness-wave",
      salience: logistics.sickness.severity >= 0.52 ? "high" : "medium",
      tone: "sober",
      sourceCategory: "body_logistics",
      summary: selectGroundedTemplate(world, band, `talk:logistics:sickness:${stressBucket(logistics.sickness.severity)}`, [
        "A sickness wave is lowering spare labor without naming anyone.",
        "People are moving more carefully because care work is part of the load now.",
        `The causes are practical: ${logistics.sickness.causeKinds.map(humanizeLogistics).join(", ")}.`,
      ]),
      stateKey: `talk:logistics:sickness:${stressBucket(logistics.sickness.severity)}:${logistics.sickness.causeKinds.join("-")}`,
      whyShown: "bounded aggregate sickness wave is active",
      rawSource: "Band.bodyCampLogistics.sickness",
      rawReason: `active=${logistics.sickness.active}; severity=${round2(logistics.sickness.severity)}; causes=${logistics.sickness.causeKinds.join("|")}; activityPenalty=${round2(logistics.sickness.activityPenalty)}; care=${round2(logistics.sickness.careBurden)}; mortalityBump=${round2(logistics.sickness.mortalityPressureBump)}`,
      confidenceStatus: `duration ${logistics.sickness.durationEstimate}; recovery ${round2(logistics.sickness.recoverySignal)}`,
      interpretationKind: "direct_state",
      reasonIds: logistics.sickness.reasonIds,
      cooldownTicks: 6,
      rankBonus: 0.08,
    });
  }

  if (logistics.logisticCapacity.state === "strained" || logistics.logisticCapacity.state === "overloaded") {
    candidates.push({
      category: "body_logistics",
      family: `capacity-${logistics.logisticCapacity.state}`,
      salience: logistics.logisticCapacity.state === "overloaded" ? "high" : "medium",
      tone: logistics.logisticCapacity.state === "overloaded" ? "tense" : "resigned",
      sourceCategory: "body_logistics",
      summary: selectGroundedTemplate(world, band, `talk:logistics:capacity:${logistics.logisticCapacity.state}`, [
        "Food may exist nearby, but spare adults and carrying work are tight.",
        "A move is possible on the map, but bodies and carried loads make it slower.",
        `${logistics.logisticCapacity.limitingReason}.`,
      ]),
      stateKey: `talk:logistics:capacity:${logistics.logisticCapacity.state}:${stressBucket(1 - logistics.logisticCapacity.capacity)}`,
      whyShown: "logistical capacity is limited by care, carrying, crossing, processing, or material wear",
      rawSource: "Band.bodyCampLogistics.logisticCapacity + careTravelBurden",
      rawReason: `state=${logistics.logisticCapacity.state}; capacity=${round2(logistics.logisticCapacity.capacity)}; carry=${round2(logistics.logisticCapacity.carryingLoad)}; process=${round2(logistics.logisticCapacity.processingLoad)}; travel=${round2(logistics.logisticCapacity.travelLoad)}; crossing=${round2(logistics.logisticCapacity.crossingLoad)}; care=${round2(logistics.logisticCapacity.careLoad)}; reason=${logistics.logisticCapacity.limitingReason}`,
      confidenceStatus: `adult labor ${round2(logistics.careTravelBurden.adultLaborAvailable)}`,
      interpretationKind: "interpretation",
      reasonIds: logistics.logisticCapacity.reasonIds,
      cooldownTicks: 8,
      rankBonus: logistics.logisticCapacity.state === "overloaded" ? 0.08 : 0.04,
    });
  }

  const worn = logistics.materialWear[0];
  if (worn !== undefined && worn.condition !== "good") {
    candidates.push({
      category: "body_logistics",
      family: `wear-${worn.category}`,
      salience: worn.condition === "failing" || worn.condition === "strained" ? "medium" : "low",
      tone: worn.condition === "recovering" ? "practical" : "annoyed",
      sourceCategory: "body_logistics",
      summary: selectGroundedTemplate(world, band, `talk:logistics:wear:${worn.category}:${worn.condition}`, [
        `${humanizeLogistics(worn.category)} is ${humanizeLogistics(worn.condition)} after use.`,
        "Repair work makes fiber, wood, hide, and ordinary materials matter.",
        `${worn.consequence}.`,
      ]),
      stateKey: `talk:logistics:wear:${worn.category}:${worn.condition}:${stressBucket(worn.wear)}`,
      whyShown: "material/tool wear record is salient",
      rawSource: "Band.bodyCampLogistics.materialWear",
      rawReason: `category=${worn.category}; condition=${worn.condition}; wear=${round2(worn.wear)}; recovery=${round2(worn.recovery)}; material=${round2(worn.materialBasis)}; labor=${round2(worn.laborCost)}; consequence=${worn.consequence}`,
      confidenceStatus: `material basis ${round2(worn.materialBasis)}`,
      interpretationKind: "interpretation",
      reasonIds: worn.reasonIds,
      cooldownTicks: 12,
    });
  }

  const opportunistic = logistics.opportunisticFoodCandidates[0];
  if (opportunistic !== undefined) {
    candidates.push({
      category: "body_logistics",
      family: `opportunistic-${opportunistic.kind}`,
      salience: opportunistic.risk >= 0.46 ? "medium" : "low",
      tone: opportunistic.risk >= 0.46 ? "sober" : "practical",
      sourceCategory: "body_logistics",
      summary: selectGroundedTemplate(world, band, `talk:logistics:opportunistic:${opportunistic.kind}`, [
        `${humanizeLogistics(opportunistic.kind)} may help a little, but it is unreliable.`,
        "Pressure makes small finds worth noticing; it does not make surplus.",
        opportunistic.triggeredBy,
      ]),
      stateKey: `talk:logistics:opportunistic:${opportunistic.kind}:${stressBucket(opportunistic.usefulness)}:${stressBucket(opportunistic.risk)}`,
      whyShown: "opportunistic/scavenged food candidate is salient under pressure",
      rawSource: "Band.bodyCampLogistics.opportunisticFoodCandidates",
      rawReason: `kind=${opportunistic.kind}; usefulness=${round2(opportunistic.usefulness)}; risk=${round2(opportunistic.risk)}; labor=${round2(opportunistic.laborCost)}; reliability=${round2(opportunistic.reliability)}; trigger=${opportunistic.triggeredBy}`,
      confidenceStatus: `reliability ${round2(opportunistic.reliability)}`,
      interpretationKind: "interpretation",
      relatedTileId: opportunistic.tileId,
      reasonIds: opportunistic.reasonIds,
      cooldownTicks: 10,
    });
  }

  if (logistics.sharingPressure.pressure >= 0.28) {
    candidates.push({
      category: "body_logistics",
      family: `sharing-${logistics.sharingPressure.state}`,
      salience: logistics.sharingPressure.pressure >= 0.58 ? "medium" : "low",
      tone: logistics.sharingPressure.pressure >= 0.58 ? "tense" : "watchful",
      sourceCategory: "body_logistics",
      summary: selectGroundedTemplate(world, band, `talk:logistics:sharing:${logistics.sharingPressure.state}`, [
        "Sharing is more watchful because returns, dependents, and care work are tight.",
        "People notice the food pressure without turning it into ownership.",
        logistics.sharingPressure.state === "relief"
          ? "A better season is easing the sharing strain."
          : `Sharing state is ${humanizeLogistics(logistics.sharingPressure.state)}.`,
      ]),
      stateKey: `talk:logistics:sharing:${logistics.sharingPressure.state}:${stressBucket(logistics.sharingPressure.pressure)}`,
      whyShown: "food sharing pressure is salient and grounded in low return, dependency, care, or access pressure",
      rawSource: "Band.bodyCampLogistics.sharingPressure",
      rawReason: `state=${logistics.sharingPressure.state}; pressure=${round2(logistics.sharingPressure.pressure)}; dependency=${round2(logistics.sharingPressure.dependencyLoad)}; lowReturn=${round2(logistics.sharingPressure.lowReturnLoad)}; care=${round2(logistics.sharingPressure.careLoad)}; access=${round2(logistics.sharingPressure.accessCrowdingLoad)}; relief=${round2(logistics.sharingPressure.recoveryRelief)}`,
      confidenceStatus: "aggregate sharing pressure, no property rule",
      interpretationKind: "interpretation",
      reasonIds: logistics.sharingPressure.reasonIds,
      cooldownTicks: 12,
    });
  }

  if (logistics.campCleanliness.pressure >= 0.28) {
    candidates.push({
      category: "body_logistics",
      family: `cleanliness-${logistics.campCleanliness.state}`,
      salience: logistics.campCleanliness.pressure >= 0.56 ? "medium" : "low",
      tone: logistics.campCleanliness.state === "recovering" ? "practical" : "annoyed",
      sourceCategory: "body_logistics",
      summary: selectGroundedTemplate(world, band, `talk:logistics:cleanliness:${logistics.campCleanliness.state}`, [
        "The camp is useful, but waste and wet ground are raising pressure.",
        "People complain about the camp mess because staying has a bodily cost.",
        logistics.campCleanliness.state === "recovering"
          ? "The place is getting easier after rest or lighter use."
          : "This is camp cleanliness pressure, not sanitation technology.",
      ]),
      stateKey: `talk:logistics:cleanliness:${logistics.campCleanliness.state}:${stressBucket(logistics.campCleanliness.pressure)}`,
      whyShown: "camp cleanliness/waste pressure is salient",
      rawSource: "Band.bodyCampLogistics.campCleanliness",
      rawReason: `state=${logistics.campCleanliness.state}; pressure=${round2(logistics.campCleanliness.pressure)}; repeated=${round2(logistics.campCleanliness.repeatedStayLoad)}; wet=${round2(logistics.campCleanliness.wetCampLoad)}; processing=${round2(logistics.campCleanliness.processingWasteLoad)}; sickness=${round2(logistics.campCleanliness.sicknessLoad)}; scavenger=${round2(logistics.campCleanliness.scavengerPressure)}; recovery=${round2(logistics.campCleanliness.recovery)}`,
      confidenceStatus: `movement debate ${round2(logistics.campCleanliness.movementDebate)}`,
      interpretationKind: "interpretation",
      relatedTileId: band.position,
      reasonIds: logistics.campCleanliness.reasonIds,
      cooldownTicks: 10,
    });
  }
}

function pushRelationshipMemoryTalk(candidates: CampTalkCandidate[], world: WorldState, band: Band): void {
  const memory = band.relationshipMemory;

  if (memory === undefined || memory.reasonIds.length === 0 || memory.mode === "quiet") {
    return;
  }

  const skill = memory.practiceSkills[0];
  if (skill !== undefined && skill.status !== "watched") {
    candidates.push({
      category: "relationship_memory",
      family: `practice-${skill.skill}`,
      salience: skill.status === "reliable" || skill.status === "strained" ? "medium" : "low",
      tone: skill.status === "strained" || skill.status === "rusty" ? "resigned" : "practical",
      sourceCategory: "relationship_memory",
      summary: selectGroundedTemplate(world, band, `talk:relationship:skill:${skill.skill}:${skill.status}`, [
        `${humanizeLogistics(skill.skill)} is becoming ${humanizeLogistics(skill.status)} through repeated work.`,
        "Practice is helping a little, but it stays bounded by labor, weather, and returns.",
        `${skill.basis}.`,
      ]),
      stateKey: `talk:relationship:skill:${skill.skill}:${skill.status}:${stressBucket(skill.practice)}`,
      whyShown: "practical skill-by-practice record is salient",
      rawSource: "Band.relationshipMemory.practiceSkills",
      rawReason: `skill=${skill.skill}; status=${skill.status}; practice=${round2(skill.practice)}; success=${skill.successCount}; failure=${skill.failureCount}; stale=${round2(skill.staleRisk)}; effect=${round2(skill.effect)}; basis=${skill.basis}`,
      confidenceStatus: `confidence ${round2(skill.confidence)}; labor relief ${round2(skill.laborRelief)}; risk relief ${round2(skill.riskRelief)}`,
      interpretationKind: "interpretation",
      reasonIds: skill.reasonIds,
      cooldownTicks: 14,
      rankBonus: skill.status === "reliable" ? 0.04 : 0.02,
    });
  }

  const animal = memory.animalFamiliarity[0];
  if (animal !== undefined) {
    candidates.push({
      category: "relationship_memory",
      family: `animal-${animal.kind}`,
      salience: animal.risk >= 0.52 || animal.campFollowing >= 0.36 ? "medium" : "low",
      tone: animal.risk >= 0.52 || animal.kind === "scavenger_risk" ? "watchful" : "practical",
      sourceCategory: "relationship_memory",
      summary: selectGroundedTemplate(world, band, `talk:relationship:animal:${animal.stockId}:${animal.kind}`, [
        `${animal.label} are familiar enough to read, but still not controlled.`,
        animal.kind === "wary_of_hunters"
          ? "The hunters know the route better, and the animals are more wary too."
          : animal.kind === "camp_nuisance" || animal.kind === "scavenger_risk"
            ? "Camp-edge animal signs are becoming part of how people judge the place."
            : `${humanizeLogistics(animal.kind)} is how people describe these animal signs now.`,
        animal.basis,
      ]),
      stateKey: `talk:relationship:animal:${animal.stockId}:${animal.kind}:${stressBucket(animal.humanLearning + animal.risk)}`,
      whyShown: "animal-human familiarity or camp-edge pattern is salient",
      rawSource: "Band.relationshipMemory.animalFamiliarity",
      rawReason: `stock=${animal.stockId}; kind=${animal.kind}; learning=${round2(animal.humanLearning)}; wariness=${round2(animal.animalWariness)}; campFollowing=${round2(animal.campFollowing)}; risk=${round2(animal.risk)}; basis=${animal.basis}`,
      confidenceStatus: `confidence ${round2(animal.confidence)}; no control ${String(animal.noAnimalControl)}`,
      interpretationKind: "interpretation",
      relatedTileId: animal.sourceTileIds[0],
      reasonIds: animal.reasonIds,
      cooldownTicks: 12,
    });
  }

  const gathering = memory.seasonalAggregations[0];
  if (gathering !== undefined) {
    candidates.push({
      category: "relationship_memory",
      family: `aggregation-${gathering.trigger}`,
      salience: gathering.intensity >= 0.5 || gathering.tension >= 0.46 ? "medium" : "low",
      tone: gathering.tension > gathering.tolerance ? "watchful" : "practical",
      sourceCategory: "relationship_memory",
      summary: selectGroundedTemplate(world, band, `talk:relationship:gathering:${String(gathering.tileId)}:${gathering.trigger}`, [
        "A rich seasonal place is drawing familiar use for a while.",
        "This is a temporary gathering around resources and should disperse when the season turns.",
        `${humanizeLogistics(gathering.trigger)} is the reason people notice others here.`,
      ]),
      stateKey: `talk:relationship:gathering:${String(gathering.tileId)}:${gathering.trigger}:${stressBucket(gathering.intensity)}`,
      whyShown: "temporary seasonal aggregation signal is grounded in resource/place/social pressure",
      rawSource: "Band.relationshipMemory.seasonalAggregations",
      rawReason: `tile=${String(gathering.tileId)}; trigger=${gathering.trigger}; intensity=${round2(gathering.intensity)}; tolerance=${round2(gathering.tolerance)}; tension=${round2(gathering.tension)}; duration=${gathering.expectedDuration}; dispersal=${round2(gathering.dispersalSignal)}; basis=${gathering.basis}`,
      confidenceStatus: `temporary ${String(gathering.noSettlement)}`,
      interpretationKind: "interpretation",
      relatedTileId: gathering.tileId,
      reasonIds: gathering.reasonIds,
      cooldownTicks: 12,
    });
  }

  const failure = memory.failureStories[0];
  if (failure !== undefined && failure.strength >= 0.24) {
    candidates.push({
      category: "relationship_memory",
      family: `failure-${failure.kind}`,
      salience: failure.strength >= 0.58 ? "medium" : "low",
      tone: failure.caution >= 0.42 ? "sober" : "watchful",
      sourceCategory: "relationship_memory",
      summary: selectGroundedTemplate(world, band, `talk:relationship:failure:${failure.kind}:${failure.trend}`, [
        `${failure.phrase}.`,
        failure.trend === "stale"
          ? "The old warning is becoming stale because it has not been reinforced."
          : "The warning is practical memory from a bad outcome.",
        failure.basis,
      ]),
      stateKey: `talk:relationship:failure:${failure.kind}:${failure.trend}:${stressBucket(failure.strength)}`,
      whyShown: "grounded failure story is salient",
      rawSource: "Band.relationshipMemory.failureStories",
      rawReason: `kind=${failure.kind}; strength=${round2(failure.strength)}; stale=${round2(failure.staleness)}; trend=${failure.trend}; caution=${round2(failure.caution)}; basis=${failure.basis}`,
      confidenceStatus: `practical warning only ${String(failure.noMyth)}`,
      interpretationKind: "interpretation",
      relatedTileId: failure.tileId,
      reasonIds: failure.reasonIds,
      cooldownTicks: 16,
    });
  }

  const reputation = memory.reputations[0];
  if (reputation !== undefined && (reputation.familiarity >= 0.22 || reputation.tension >= 0.22 || reputation.sharedUse >= 0.22)) {
    candidates.push({
      category: "relationship_memory",
      family: `reputation-${reputation.kind}`,
      salience: reputation.tension >= 0.45 ? "medium" : "low",
      tone: reputation.tension >= 0.45 ? "watchful" : "practical",
      sourceCategory: "relationship_memory",
      summary: selectGroundedTemplate(world, band, `talk:relationship:reputation:${String(reputation.otherBandId)}:${reputation.kind}`, [
        `${String(reputation.otherBandId)} is remembered as ${humanizeLogistics(reputation.kind)} from contact, not rumor alone.`,
        "People judge that band from seen sharing, strain, and familiarity.",
        reputation.staleness >= 0.6
          ? "The memory is getting stale."
          : reputation.basis,
      ]),
      stateKey: `talk:relationship:reputation:${String(reputation.otherBandId)}:${reputation.kind}:${stressBucket(reputation.tension + reputation.trust)}`,
      whyShown: "receiver-specific inter-band reputation record is salient",
      rawSource: "Band.relationshipMemory.reputations",
      rawReason: `other=${String(reputation.otherBandId)}; kind=${reputation.kind}; familiarity=${round2(reputation.familiarity)}; trust=${round2(reputation.trust)}; tension=${round2(reputation.tension)}; shared=${round2(reputation.sharedUse)}; stale=${round2(reputation.staleness)}; basis=${reputation.basis}`,
      confidenceStatus: `receiver-specific ${String(reputation.receiverSpecific)}`,
      interpretationKind: "interpretation",
      relatedBandId: reputation.otherBandId,
      reasonIds: reputation.reasonIds,
      cooldownTicks: 14,
    });
  }

  const route = memory.routeFamiliarity[0];
  if (route !== undefined && route.confidence >= 0.22) {
    candidates.push({
      category: "relationship_memory",
      family: `route-${route.kind}`,
      salience: route.status === "rewritten" || route.status === "strained" ? "medium" : "low",
      tone: route.status === "rewritten" || route.status === "strained" ? "watchful" : "practical",
      sourceCategory: "relationship_memory",
      summary: selectGroundedTemplate(world, band, `talk:relationship:route:${String(route.toTileId)}:${route.status}`, [
        route.status === "rewritten"
          ? "A familiar passage was rewritten by a bad segment."
          : "Repeated passage is making this way easier to judge.",
        "The passage is remembered through use and remains just a travel habit.",
        `${humanizeLogistics(route.kind)}: ${route.basis}.`,
      ]),
      stateKey: `talk:relationship:route:${String(route.fromTileId)}:${String(route.toTileId)}:${route.status}`,
      whyShown: "route familiarity or route failure memory is salient",
      rawSource: "Band.relationshipMemory.routeFamiliarity",
      rawReason: `from=${String(route.fromTileId)}; to=${String(route.toTileId)}; kind=${route.kind}; confidence=${round2(route.confidence)}; ease=${round2(route.ease)}; risk=${round2(route.risk)}; use=${route.useCount}; failures=${route.failureCount}; status=${route.status}; basis=${route.basis}`,
      confidenceStatus: `no built route ${String(route.noRoad)}`,
      interpretationKind: "interpretation",
      relatedTileId: route.toTileId,
      reasonIds: route.reasonIds,
      cooldownTicks: 14,
    });
  }
}

function pushForagingAdaptationTalk(candidates: CampTalkCandidate[], world: WorldState, band: Band): void {
  const adaptation = band.foragingAdaptation;

  if (adaptation === undefined || adaptation.reasonIds.length === 0) {
    return;
  }

  const learning = adaptation.learningRecords.find((record) => record.status !== "not_known");
  if (learning !== undefined && (learning.status === "watched" || learning.status === "known_poor" || learning.status === "known_risky" || learning.status === "cautiously_known")) {
    candidates.push({
      category: "adaptation",
      family: `learning-${learning.status}`,
      salience: learning.status === "known_risky" ? "medium" : "low",
      tone: learning.status === "known_risky" || learning.status === "cautiously_known" ? "sober" : "practical",
      sourceCategory: "adaptation",
      summary: selectGroundedTemplate(world, band, `talk:adaptation:learning:${String(learning.tileId)}:${learning.status}`, [
        learning.status === "known_risky"
          ? `After repeated signs, the ${humanizeResourceClass(learning.resourceClassId)} nearby is known as risky rather than mysterious.`
          : learning.status === "known_poor"
            ? `After many passes, this ${humanizeResourceClass(learning.resourceClassId)} is no blank spot, but it is still poor food.`
            : `Repeated local use is turning a ${humanizeResourceClass(learning.resourceClassId)} patch from uncertain into watched.`,
        "People know more because they have seen the place again, not because every hidden resource is revealed.",
        `${learning.unlockHint}.`,
      ]),
      stateKey: `talk:adaptation:learning:${String(learning.tileId)}:${learning.status}:${stressBucket(learning.confidence)}`,
      whyShown: "empirical learning record changed or clarified a band-known resource",
      rawSource: "Band.foragingAdaptation.learningRecords",
      rawReason: `tile=${String(learning.tileId)}; class=${learning.resourceClassId}; status=${learning.status}; source=${learning.source}; proximity=${learning.proximityCount}; tests=${learning.testCount}; gated=${learning.gatedReason}`,
      confidenceStatus: `confidence ${round2(learning.confidence)}; seasons ${learning.observedSeasons.join(",") || "none"}`,
      interpretationKind: "interpretation",
      relatedTileId: learning.tileId,
      reasonIds: learning.reasonIds,
      cooldownTicks: 12,
      rankBonus: 0.02,
    });
  }

  const fallback = adaptation.fallbackCandidates[0];
  if (fallback !== undefined && adaptation.mode !== "stable") {
    candidates.push({
      category: "adaptation",
      family: `fallback-${fallback.level}`,
      salience: fallback.level === "emergency" ? "high" : fallback.level === "expanded" ? "medium" : "low",
      tone: fallback.riskCost >= 0.45 ? "tense" : fallback.laborCost >= 0.5 ? "resigned" : "practical",
      sourceCategory: "adaptation",
      summary: selectGroundedTemplate(world, band, `talk:adaptation:fallback:${String(fallback.tileId)}:${fallback.level}`, [
        fallback.level === "emergency"
          ? `Hunger is making ${humanizeResourceClass(fallback.resourceClassId)} look worth trying despite the cost.`
          : `The band is widening fallback food because ordinary returns are not enough.`,
        fallback.riskCost >= 0.45
          ? "The food is not safe just because people are hungry."
          : fallback.laborCost >= 0.5
            ? "The problem is that getting it takes more adult work."
            : "Marginal food may prevent worse hunger, but it is not a magic surplus.",
        fallback.reason,
      ]),
      stateKey: `talk:adaptation:fallback:${String(fallback.tileId)}:${fallback.level}:${stressBucket(fallback.expectedUsefulness)}`,
      whyShown: "fallback candidate became salient under food pressure",
      rawSource: "Band.foragingAdaptation.fallbackCandidates",
      rawReason: `tile=${String(fallback.tileId)}; class=${fallback.resourceClassId}; level=${fallback.level}; labor=${round2(fallback.laborCost)}; risk=${round2(fallback.riskCost)}; qualityPenalty=${round2(fallback.dietQualityPenalty)}; usefulness=${round2(fallback.expectedUsefulness)}`,
      confidenceStatus: `confidence ${round2(fallback.confidence)}; mode ${adaptation.mode}`,
      interpretationKind: "interpretation",
      relatedTileId: fallback.tileId,
      reasonIds: fallback.reasonIds,
      cooldownTicks: fallback.level === "emergency" ? 6 : 10,
      rankBonus: fallback.level === "emergency" ? 0.08 : 0.03,
    });
  }

  const badTrip = adaptation.tripFailureMemories.find((memory) => memory.action === "abandon_temporarily" || memory.action === "reduce_confidence");
  if (badTrip !== undefined) {
    candidates.push({
      category: "adaptation",
      family: `trip-${badTrip.action}`,
      salience: badTrip.action === "abandon_temporarily" ? "medium" : "low",
      tone: "annoyed",
      sourceCategory: "adaptation",
      summary: selectGroundedTemplate(world, band, `talk:adaptation:trip:${String(badTrip.tileId)}:${badTrip.action}`, [
        badTrip.action === "abandon_temporarily"
          ? "The hunters stopped trusting a long poor-return route for now."
          : "Another poor trip made people trust the target less.",
        "One bad trip does not erase the route, but repeated weak returns matter.",
        `Mean return is ${round2(badTrip.meanReturn)} after ${badTrip.recentTripCount} recent trips.`,
      ]),
      stateKey: `talk:adaptation:trip:${String(badTrip.tileId)}:${badTrip.action}:${badTrip.failureCount}:${badTrip.lowReturnCount}`,
      whyShown: "recent activity trips repeatedly underperformed",
      rawSource: "Band.foragingAdaptation.tripFailureMemories",
      rawReason: `tile=${String(badTrip.tileId)}; task=${badTrip.taskGroupType}; failures=${badTrip.failureCount}; lowReturns=${badTrip.lowReturnCount}; successes=${badTrip.successCount}; distance=${badTrip.longestDistanceTiles}; penalty=${round2(badTrip.confidencePenalty)}`,
      confidenceStatus: badTrip.recoveredBySuccess ? "recovering after success" : `rest suggested ${badTrip.restTicksSuggested} ticks`,
      interpretationKind: "interpretation",
      relatedTileId: badTrip.tileId,
      reasonIds: badTrip.reasonIds,
      cooldownTicks: 8,
      rankBonus: 0.04,
    });
  }

  const probe = adaptation.nearbyOpportunityProbes.find((entry) => entry.comparison === "nearby_probe");
  if (probe !== undefined) {
    candidates.push({
      category: "adaptation",
      family: "nearby-probe",
      salience: "low",
      tone: "practical",
      sourceCategory: "adaptation",
      summary: selectGroundedTemplate(world, band, `talk:adaptation:probe:${String(probe.tileId)}`, [
        "A nearby patch is worth probing because the camp core is worn.",
        "The close alternative is not treated like a distant expedition.",
        "People can compare a nearby known place without pretending they know everything there.",
      ]),
      stateKey: `talk:adaptation:probe:${String(probe.tileId)}:${stressBucket(probe.probeReadiness)}`,
      whyShown: "known nearby opportunity is close enough to test under pressure",
      rawSource: "Band.foragingAdaptation.nearbyOpportunityProbes",
      rawReason: `tile=${String(probe.tileId)}; distance=${probe.distanceTiles}; readiness=${round2(probe.probeReadiness)}; opportunity=${round2(probe.relativeOpportunity)}; overCapacity=${round2(probe.currentOverCapacity)}; risk=${round2(probe.riskPenalty)}`,
      confidenceStatus: `confidence ${round2(probe.confidence)}; comparison ${probe.comparison}`,
      interpretationKind: "interpretation",
      relatedTileId: probe.tileId,
      reasonIds: probe.reasonIds,
      cooldownTicks: 10,
      rankBonus: 0.02,
    });
  }

  if (adaptation.crisisBreakaway.pressure >= 0.55) {
    candidates.push({
      category: "adaptation",
      family: "crisis-breakaway-pressure",
      salience: adaptation.crisisBreakaway.active ? "high" : "medium",
      tone: "tense",
      sourceCategory: "adaptation",
      summary: selectGroundedTemplate(world, band, `talk:adaptation:breakaway:${stressBucket(adaptation.crisisBreakaway.pressure)}`, [
        "The group is still together, but repeated lean seasons are making old caution weaker.",
        "Scarcity is raising breakaway pressure without turning it into conflict.",
        "A risky split only looks possible because staying also has a cost.",
      ]),
      stateKey: `talk:adaptation:breakaway:${stressBucket(adaptation.crisisBreakaway.pressure)}:${adaptation.crisisBreakaway.active}`,
      whyShown: "crisis breakaway pressure is grounded in hunger, failures, and a known risky option",
      rawSource: "Band.foragingAdaptation.crisisBreakaway",
      rawReason: `pressure=${round2(adaptation.crisisBreakaway.pressure)}; severe=${adaptation.crisisBreakaway.severeGroundedPressure}; labor=${adaptation.crisisBreakaway.adultLaborEnough}; noSafeAcceptedSolution=${adaptation.crisisBreakaway.noSafeAcceptedSolution}; destination=${String(adaptation.crisisBreakaway.knownRiskyDestination ?? "none")}`,
      confidenceStatus: `mode ${adaptation.mode}; hunger ${round2(adaptation.hungerSeverity)}; streak ${adaptation.hungerStreak}`,
      interpretationKind: "interpretation",
      relatedTileId: adaptation.crisisBreakaway.knownRiskyDestination,
      reasonIds: adaptation.crisisBreakaway.reasonIds,
      cooldownTicks: 6,
      rankBonus: 0.08,
    });
  }
}

function pushSurvivalTalk(candidates: CampTalkCandidate[], world: WorldState, band: Band): void {
  const support = band.seasonalSupport;
  if (support === undefined) {
    return;
  }
  const current = support.currentSeasonSupport;
  const hunger = support.hungerClassification;
  if (hunger === "stable") {
    if (current.rawSupportRatio <= 1.08 || support.returnTrend4Season < -0.02) {
      candidates.push({
        category: "survival",
        family: "stable-fragile-support",
        salience: "low",
        tone: "practical",
        sourceCategory: "survival",
        summary: selectGroundedTemplate(world, band, "talk:stable-fragile-support", [
          "Food is holding for now, but people keep watching the margin.",
          "Nobody is calling this a crisis, but the camp still treats the season carefully.",
          "The support is good enough; that is not the same as easy.",
        ]),
        stateKey: `talk:survival:stable:${current.mode}:${stressBucket(1.2 - current.rawSupportRatio)}`,
        whyShown: "stable support with narrow or falling margin",
        rawSource: "Band.seasonalSupport.currentSeasonSupport + return trends",
        rawReason: `classification=${hunger}; raw=${round2(current.rawSupportRatio)}; trend4=${round2(support.returnTrend4Season)}; mode=${current.mode}`,
        confidenceStatus: `support confidence ${round2(current.clampedSupportRatio)}`,
        interpretationKind: "direct_state",
        reasonIds: support.reasonIds,
        cooldownTicks: 10,
      });
    }
    return;
  }

  const severe = hunger === "crisis_deficit" || hunger === "chronic_plus_seasonal_stress";
  const recurring = support.seasonalHungerStreak >= 2 || support.deficitSeasonsLast4 >= 2;
  candidates.push({
    category: "survival",
    family: recurring ? "recurring-hunger" : "lean-season-tightening",
    salience: severe ? "high" : "medium",
    tone: severe ? "tense" : "worried",
    sourceCategory: "survival",
    summary: selectGroundedTemplate(world, band, `talk:survival:${hunger}:${recurring}`, [
      severe
        ? "The food talk has gone quiet and practical; people are counting what still works."
        : "People keep circling back to food, because this season is tightening.",
      recurring
        ? "This is not the first bad season, and that makes the worry harder to dismiss."
        : "A lean season is making even ordinary work feel more serious.",
      current.foodStress >= 0.45
        ? "The adults can feel the food work stretching thin."
        : "The camp is not starving, but nobody is treating the food margin lightly.",
    ]),
    stateKey: `talk:survival:${hunger}:${stressBucket(current.foodStress)}:${Math.min(3, support.seasonalHungerStreak)}`,
    whyShown: recurring ? "recurring hunger pressure" : "current hunger pressure",
    rawSource: "Band.seasonalSupport",
    rawReason: `classification=${hunger}; foodStress=${round2(current.foodStress)}; streak=${support.seasonalHungerStreak}; deficit4=${support.deficitSeasonsLast4}; mode=${current.mode}`,
    confidenceStatus: `food stress ${round2(current.foodStress)}`,
    interpretationKind: "direct_state",
    reasonIds: support.reasonIds,
    cooldownTicks: severe ? 3 : 8,
  });

  const load = dependentLoad(band);
  if (load >= 0.35 && current.foodStress >= 0.24) {
    candidates.push({
      category: "survival",
      family: "dependent-food-pressure",
      salience: current.foodStress >= 0.55 ? "high" : "medium",
      tone: "worried",
      sourceCategory: "demography",
      summary: selectGroundedTemplate(world, band, "talk:dependent-food-pressure", [
        "Dependents make the food worry sharper, because fewer adults can range far.",
        "The working adults are carrying more of the season than the headcount alone shows.",
        "People talk less about how many they are and more about who can actually go out.",
      ]),
      stateKey: `talk:survival:dependency:${stressBucket(load)}:${stressBucket(current.foodStress)}`,
      whyShown: "dependents and elders increase food pressure",
      rawSource: "Band.demography cohorts + Band.seasonalSupport.foodStress",
      rawReason: `dependents=${round2(band.demography.dependents)}; elders=${round2(band.demography.elders)}; workingAdults=${round2(band.demography.workingAdults)}; foodStress=${round2(current.foodStress)}`,
      confidenceStatus: `dependency load ${round2(load)}`,
      interpretationKind: "interpretation",
      reasonIds: support.reasonIds.length > 0 ? support.reasonIds : band.demography.sourceReasonIds,
      cooldownTicks: 10,
    });
  }
}

function pushWaterTalk(candidates: CampTalkCandidate[], world: WorldState, band: Band): void {
  const support = band.seasonalSupport;
  const current = support?.currentSeasonSupport;
  if (support !== undefined && current !== undefined && (current.waterStress >= 0.34 || current.mode === "dry")) {
    const severe = current.waterStress >= 0.7 || support.hungerClassification === "chronic_water_deficit";
    candidates.push({
      category: "water",
      family: severe ? "bad-water-or-dry-warning" : "known-water-anchor",
      salience: severe ? "high" : "medium",
      tone: severe ? "tense" : "watchful",
      sourceCategory: "water",
      summary: selectGroundedTemplate(world, band, `talk:water:${current.mode}:${stressBucket(current.waterStress)}`, [
        severe
          ? "People keep warning each other about water before they talk about distance."
          : "Known water is doing more than feeding thirst; it is anchoring the camp.",
        current.mode === "dry"
          ? "The dry season makes every route sound like a water argument."
          : "The band is watching water closely even where the place is familiar.",
        "Nobody wants to trade a known water edge for a guess.",
      ]),
      stateKey: `talk:water:${current.mode}:${stressBucket(current.waterStress)}`,
      whyShown: "water stress or dry seasonal support mode",
      rawSource: "Band.seasonalSupport.currentSeasonSupport",
      rawReason: `waterStress=${round2(current.waterStress)}; mode=${current.mode}; classification=${support.hungerClassification}`,
      confidenceStatus: `water stress ${round2(current.waterStress)}`,
      interpretationKind: "direct_state",
      reasonIds: support.reasonIds,
      cooldownTicks: severe ? 4 : 9,
    });
  }

  const warnedPlace = Object.values(band.placeMemory).find((memory) =>
    memory.valences.includes("avoid_place") ||
    (memory.lastKnownWaterStress ?? 0) >= 0.58 ||
    (memory.lastKnownRiskEstimate ?? 0) >= 0.62
  );
  if (warnedPlace !== undefined) {
    candidates.push({
      category: "water",
      family: "old-water-warning",
      salience: "medium",
      tone: "watchful",
      sourceCategory: "range_knowledge",
      summary: selectGroundedTemplate(world, band, `talk:old-water-warning:${String(warnedPlace.tileId)}`, [
        "An old warning still makes that water route sound wrong.",
        "People remember the place as useful to avoid, not useful to test again soon.",
        "The warning is vague in distance, but clear enough to make the route unpopular.",
      ]),
      stateKey: `talk:water-warning:${String(warnedPlace.tileId)}:${stressBucket(warnedPlace.lastKnownRiskEstimate ?? warnedPlace.lastKnownWaterStress ?? 0)}`,
      whyShown: "place memory carries avoid/risk/water-stress valence",
      rawSource: "Band.placeMemory avoid/water/risk valences",
      rawReason: `tile=${String(warnedPlace.tileId)}; valences=${warnedPlace.valences.join("|")}; water=${round2(warnedPlace.lastKnownWaterStress ?? 0)}; risk=${round2(warnedPlace.lastKnownRiskEstimate ?? 0)}`,
      confidenceStatus: `place confidence ${round2(warnedPlace.confidence)}`,
      interpretationKind: "interpretation",
      relatedTileId: warnedPlace.tileId,
      reasonIds: warnedPlace.reasonIds,
      cooldownTicks: 14,
    });
  }
}

function pushPlantTalk(candidates: CampTalkCandidate[], world: WorldState, band: Band): void {
  const plant = band.visibleNature?.plantCards.find((card) =>
    card.plantPatchEffect === "overused" ||
    card.plantPatchEffect === "recovering" ||
    card.plantPatchEffect === "fallback_food" ||
    card.plantPatchEffect === "risky_or_avoided" ||
    card.plantPatchEffect === "seasonal_pulse"
  ) ?? band.visibleNature?.plantCards[0];
  if (plant === undefined) {
    return;
  }

  const salience: CampTalkSalience =
    plant.plantPatchEffect === "overused" || plant.plantPatchEffect === "risky_or_avoided" ? "medium" : "low";
  const tone: CampTalkTone =
    plant.plantPatchEffect === "overused" ? "annoyed" :
    plant.plantPatchEffect === "risky_or_avoided" ? "watchful" :
    plant.plantPatchEffect === "recovering" || plant.plantPatchEffect === "seasonal_pulse" ? "relieved" :
    "practical";

  candidates.push({
    category: "plants",
    family: `plant-${plant.plantPatchEffect}`,
    salience,
    tone,
    sourceCategory: "plants",
    summary: selectGroundedTemplate(world, band, `talk:plant:${plant.plantPatchEffect}:${plant.plantClassId}`, [
      plant.plantPatchEffect === "overused"
        ? `People are tired of hearing that the same ${plant.label} patch is thinner again.`
        : `${plant.label} keeps coming up in food talk because it is visible in known ground.`,
      plant.plantPatchEffect === "recovering"
        ? `After a quieter stretch, ${plant.label} looks a little less worn.`
        : plant.plantPatchEffect === "fallback_food"
          ? `Nobody is excited about ${plant.label}, but it gives the camp something to watch.`
          : plant.plantPatchEffect === "risky_or_avoided"
            ? `${plant.label} is discussed with caution, not confidence.`
            : plant.plantPatchEffect === "seasonal_pulse"
              ? `The seasonal pulse around ${plant.label} has made people less tense.`
              : `The patch is ordinary, but it is still part of the day's food talk.`,
      plant.laborCost >= 0.5
        ? `The useful food is also annoying work.`
        : `The plant work is familiar enough that people know what they are complaining about.`,
    ]),
    stateKey: `talk:plant:${plant.patchId}:${plant.plantPatchEffect}:${stressBucket(plant.pressure + plant.depletion)}`,
    whyShown: `visible plant patch effect ${plant.plantPatchEffect}`,
    rawSource: plant.rawSource,
    rawReason: `plant=${plant.plantClassId}; effect=${plant.plantPatchEffect}; use=${plant.useStatus}; pressure=${round2(plant.pressure)}; depletion=${round2(plant.depletion)}; reasons=${plant.topReasons.join("|")}`,
    confidenceStatus: `${plant.knowledgeState}; availability ${plant.seasonalAvailability}`,
    interpretationKind: "interpretation",
    relatedTileId: plant.tileId,
    reasonIds: band.visibleNature?.reasonIds ?? [],
    cooldownTicks: 10,
  });
}

function pushAquaticTalk(candidates: CampTalkCandidate[], world: WorldState, band: Band): void {
  const aquatic = band.visibleNature?.aquaticCards.find((card) =>
    card.aquaticEffect === "overfished" ||
    card.aquaticEffect === "wetland_buffer" ||
    card.aquaticEffect === "winter_buffer" ||
    card.aquaticEffect === "fish_pulse" ||
    card.aquaticEffect === "poor_water_food"
  ) ?? band.visibleNature?.aquaticCards[0];
  if (aquatic === undefined) {
    return;
  }

  candidates.push({
    category: "aquatic",
    family: `aquatic-${aquatic.aquaticEffect}`,
    salience: aquatic.aquaticEffect === "overfished" || aquatic.aquaticEffect === "poor_water_food" ? "medium" : "low",
    tone: aquatic.aquaticEffect === "overfished" ? "annoyed" :
      aquatic.aquaticEffect === "poor_water_food" ? "resigned" :
      aquatic.aquaticEffect === "wetland_buffer" || aquatic.aquaticEffect === "winter_buffer" ? "relieved" :
      "practical",
    sourceCategory: "aquatic",
    summary: selectGroundedTemplate(world, band, `talk:aquatic:${aquatic.aquaticEffect}:${aquatic.aquaticKind}`, [
      aquatic.aquaticEffect === "overfished"
        ? "The same water edge still helps, but people can feel it paying less."
        : `${aquatic.label} keeps the water place in conversation.`,
      aquatic.aquaticEffect === "wetland_buffer" || aquatic.aquaticEffect === "winter_buffer"
        ? "The wetland food is taking the edge off the season."
        : aquatic.aquaticEffect === "fish_pulse"
          ? "The fish signs are good enough that people talk about the water with relief."
          : aquatic.aquaticEffect === "poor_water_food"
            ? "There is water, but the food talk around it is disappointed."
            : "People know this water edge as work, not magic.",
      aquatic.waterContext === "delta_wetland"
        ? "The wet ground is useful and uncomfortable at the same time."
        : "Nobody forgets the smell of a useful fishing place.",
    ]),
    stateKey: `talk:aquatic:${aquatic.stockId}:${aquatic.aquaticEffect}:${stressBucket(aquatic.pressure)}`,
    whyShown: `visible aquatic effect ${aquatic.aquaticEffect}`,
    rawSource: aquatic.rawSource,
    rawReason: `aquatic=${aquatic.aquaticKind}; context=${aquatic.waterContext}; effect=${aquatic.aquaticEffect}; pressure=${round2(aquatic.pressure)}; reasons=${aquatic.topReasons.join("|")}`,
    confidenceStatus: `${aquatic.knowledgeState}; reliability ${round2(aquatic.reliability)}`,
    interpretationKind: "interpretation",
    relatedTileId: aquatic.anchorTileId,
    reasonIds: band.visibleNature?.reasonIds ?? [],
    cooldownTicks: 10,
  });
}

function pushForestTalk(candidates: CampTalkCandidate[], world: WorldState, band: Band): void {
  const forest = band.visibleNature?.forestCards.find((card) =>
    card.growthTrend === "declining" ||
    card.growthTrend === "dieback" ||
    card.growthTrend === "recovering" ||
    card.visibilityEffect >= 0.48 ||
    card.fruitMastLink !== "none" ||
    card.animalHabitatValue >= 0.42
  ) ?? band.visibleNature?.forestCards[0];
  if (forest === undefined) {
    return;
  }

  candidates.push({
    category: "forest",
    family: `forest-${forest.growthTrend}`,
    salience: forest.growthTrend === "declining" || forest.growthTrend === "dieback" || forest.visibilityEffect >= 0.58 ? "medium" : "low",
    tone: forest.growthTrend === "declining" || forest.growthTrend === "dieback" ? "resigned" :
      forest.growthTrend === "recovering" ? "relieved" :
      forest.visibilityEffect >= 0.48 ? "watchful" :
      "practical",
    sourceCategory: "forest",
    summary: selectGroundedTemplate(world, band, `talk:forest:${forest.coverType}:${forest.growthTrend}`, [
      forest.growthTrend === "declining" || forest.growthTrend === "dieback"
        ? `People keep saying the ${forest.label} looks more worn than it used to.`
        : `${forest.label} keeps shaping how the camp reads the place.`,
      forest.visibilityEffect >= 0.48
        ? "The tree cover is useful, but it makes the edge feel less readable."
        : forest.growthTrend === "recovering"
          ? "A quieter season has made the trees look less pressured."
          : forest.fruitMastLink !== "none"
            ? "Fruit and mast keep the trees in practical conversation."
            : "The trees are mostly a place cue, not a new economy.",
      forest.animalHabitatValue >= 0.42
        ? "People connect the tree edge with animal signs."
        : "The talk stays about shelter, shade, and visibility.",
    ]),
    stateKey: `talk:forest:${forest.patchId}:${forest.growthTrend}:${stressBucket(forest.visibilityEffect + forest.pressure)}`,
    whyShown: "visible forest card with growth, visibility, mast, or animal-habitat cue",
    rawSource: forest.rawSource,
    rawReason: `forest=${forest.coverType}; growth=${forest.growthTrend}; visibility=${round2(forest.visibilityEffect)}; pressure=${round2(forest.pressure)}; reasons=${forest.topReasons.join("|")}`,
    confidenceStatus: `${forest.knowledgeState}; health ${round2(forest.health)}`,
    interpretationKind: "interpretation",
    relatedTileId: forest.tileId,
    reasonIds: band.visibleNature?.reasonIds ?? [],
    cooldownTicks: 12,
  });
}

function pushFaunaTalk(candidates: CampTalkCandidate[], world: WorldState, band: Band): void {
  const recentAnimalTrip = (band.recentIntraSeasonTrips ?? []).find((trip) => trip.animalActivityTrace !== undefined);
  const trace = recentAnimalTrip?.animalActivityTrace;
  if (trace !== undefined && recentAnimalTrip !== undefined) {
    candidates.push({
      category: "fauna",
      family: trace.outcomeClass === "success" ? "hunt-success" : trace.dangerClass === "high" ? "animal-danger" : "failed-hunt",
      salience: trace.dangerClass === "high" ? "high" : trace.outcomeClass === "failure" ? "medium" : "low",
      tone: trace.dangerClass === "high" ? "tense" : trace.outcomeClass === "failure" ? "annoyed" : "practical",
      sourceCategory: "fauna",
      summary: selectGroundedTemplate(world, band, `talk:animal-trace:${trace.outcomeClass}:${trace.dangerClass}`, [
        trace.dangerClass === "high"
          ? "The hunters came back talking less about meat and more about caution."
          : trace.outcomeClass === "failure"
            ? "The hunters are embarrassed enough that nobody needs to say much."
            : "A real animal route is easier to trust after it pays off.",
        trace.knowledgeUpdate === "failure_staled_route"
          ? "The old animal route sounds less dependable now."
          : trace.knowledgeUpdate === "reliable_route_strengthened"
            ? "The route is becoming a practical memory, not a sure thing."
            : trace.knowledgeUpdate === "danger_caution_added"
              ? "People will remember the animal sign before they remember the return."
              : "The animal talk is grounded in tracks and work, not hidden truth.",
        trace.warinessChange > 0.08
          ? "People suspect the animals are getting harder to approach."
          : "Nobody treats one trip as a permanent promise.",
      ]),
      stateKey: `talk:animal-trip:${trace.stockId}:${trace.knowledgeUpdate}:${recentAnimalTrip.activityOutcome}`,
      whyShown: "recent hunting trip with grounded animal activity trace",
      rawSource: "IntraSeasonTripRecord.animalActivityTrace",
      rawReason: `stock=${trace.stockId}; kind=${trace.faunaKind}; outcome=${trace.outcomeClass}; update=${trace.knowledgeUpdate}; danger=${trace.dangerClass}; pressureApplied=${round2(trace.pressureApplied)}; warinessChange=${round2(trace.warinessChange)}`,
      confidenceStatus: `animal confidence ${round2(trace.confidence)}`,
      interpretationKind: "direct_state",
      relatedTileId: trace.anchorTileId,
      reasonIds: trace.reasonIds,
      cooldownTicks: 8,
    });
  }

  const animal = band.visibleNature?.faunaCards.find((card) =>
    card.knowledgeState === "failed_to_find" ||
    card.knowledgeState === "stale_route" ||
    card.knowledgeState === "reliable_route" ||
    card.knowledgeState === "hunted_successfully" ||
    card.risk >= 0.55 ||
    card.wariness >= 0.42 ||
    card.routeReliability >= 0.45
  ) ?? band.visibleNature?.faunaCards[0];
  if (animal === undefined) {
    return;
  }

  candidates.push({
    category: "fauna",
    family: `animal-${animal.knowledgeState}`,
    salience: animal.risk >= 0.55 ? "medium" : "low",
    tone: animal.risk >= 0.55 ? "tense" :
      animal.knowledgeState === "failed_to_find" || animal.knowledgeState === "stale_route" ? "annoyed" :
      animal.routeReliability >= 0.45 ? "practical" :
      "watchful",
    sourceCategory: "fauna",
    summary: selectGroundedTemplate(world, band, `talk:animal-card:${animal.knowledgeState}:${animal.archetype}`, [
      animal.knowledgeState === "failed_to_find" || animal.knowledgeState === "stale_route"
        ? `${animal.label} keeps being talked about because the signs are less trustworthy now.`
        : `${animal.label} signs are part of what people notice around camp.`,
      animal.routeReliability >= 0.45
        ? "The route sounds useful, but nobody calls it certain."
        : animal.wariness >= 0.42
          ? "People think the animals are learning to avoid close work."
          : animal.risk >= 0.55
            ? "The animal signs make the nearby edge feel tense."
            : "Tracks are enough for talk; they are not enough for certainty.",
      animal.usefulness === "risky_value"
        ? "Useful and risky can be the same animal."
        : "The talk stays practical: where, when, and whether the route is worth trying.",
    ]),
    stateKey: `talk:animal-card:${animal.stockId}:${animal.knowledgeState}:${stressBucket(animal.risk + animal.wariness)}`,
    whyShown: `visible animal ${animal.knownness}/${animal.usefulness}`,
    rawSource: animal.rawSource,
    rawReason: `stock=${animal.stockId}; knownness=${animal.knownness}; usefulness=${animal.usefulness}; risk=${round2(animal.risk)}; wariness=${round2(animal.wariness)}; evidence=${animal.recentEvidence.join("|")}`,
    confidenceStatus: `confidence ${round2(animal.confidence)}; route ${round2(animal.routeReliability)}`,
    interpretationKind: "interpretation",
    relatedTileId: animal.anchorTileId,
    reasonIds: band.visibleNature?.reasonIds ?? [],
    cooldownTicks: 10,
  });
}

function pushAcuteRiskTalk(candidates: CampTalkCandidate[], world: WorldState, band: Band): void {
  const episode = band.acuteRisk?.latestEpisode;
  if (episode === undefined || episode.remainingRecoverySeasons <= 0) {
    return;
  }
  candidates.push({
    category: "acute_risk",
    family: `acute-${episode.kind}`,
    salience: episode.severity === "critical" || episode.severity === "severe" ? "high" : "medium",
    tone: episode.kind.includes("sickness") || episode.kind.includes("exhaustion") ? "worried" : "tense",
    sourceCategory: "acute_risk",
    summary: selectGroundedTemplate(world, band, `talk:acute:${episode.kind}:${episode.severity}`, [
      `${titleForAcuteRisk(episode.kind)} is still changing how people talk about nearby work.`,
      episode.kind === "bad_water_sickness"
        ? "The bad-water warning is fresh enough that nobody argues with it loudly."
        : episode.kind === "animal_encounter_injury"
          ? "Animal danger has made the route talk short and cautious."
          : episode.kind === "exposure_or_cold_snap"
            ? "The cold route is remembered as miserable, not heroic."
            : "The hardship is fading, but caution has not fully left.",
      `${episode.context.sourceLabel} is now a caution phrase around camp.`,
    ]),
    stateKey: `talk:acute:${episode.kind}:${episode.context.sourceCategory}:${episode.context.sourceResourceId ?? episode.context.sourceTileId ?? "current"}`,
    whyShown: "active acute-risk recovery effect",
    rawSource: "Band.acuteRisk.latestEpisode",
    rawReason: `${episode.kind}; severity=${episode.severity}; source=${episode.context.sourceCategory}; recovery=${episode.remainingRecoverySeasons}; reasons=${episode.groundedReasons.join("|")}`,
    confidenceStatus: `confidence ${round2(episode.confidence)}`,
    interpretationKind: "direct_state",
    relatedTileId: episode.context.sourceTileId,
    reasonIds: episode.reasonIds,
    cooldownTicks: episode.severity === "critical" || episode.severity === "severe" ? 3 : 8,
  });
}

function pushMovementTalk(candidates: CampTalkCandidate[], world: WorldState, band: Band): void {
  const move = (band.recentResidentialMoveEvents ?? [])[0];
  if (move !== undefined) {
    candidates.push({
      category: "movement",
      family: `move-${move.hardshipOutcome ?? move.status}`,
      salience: salienceForMove(move),
      tone: move.hardshipOutcome === "rejected" || move.hardshipLevel === "severe" ? "tense" : "practical",
      sourceCategory: "movement",
      summary: selectGroundedTemplate(world, band, `talk:move:${move.hardshipOutcome ?? move.status}:${move.cause}`, [
        move.hardshipOutcome === "rejected"
          ? "People keep returning to the route they chose not to take."
          : move.hardshipOutcome === "delayed"
            ? "The move is still being discussed because it took more out of the camp than expected."
            : "The camp move gives people a fresh way to judge the country.",
        move.cause === "water_stress"
          ? "The route talk starts with water before distance."
          : move.cause === "poor_return"
            ? "Bad returns made leaving sound more reasonable."
            : "The move is remembered through practical causes, not a grand story.",
        move.distanceTiles >= 4
          ? "Long moves make even quiet people count the cost."
          : "A short move can still change what feels familiar.",
      ]),
      stateKey: `talk:move:${move.status}:${move.hardshipOutcome ?? "accepted"}:${move.cause}:${String(move.toTileId)}`,
      whyShown: "recent residential movement or route hardship",
      rawSource: "Band.recentResidentialMoveEvents",
      rawReason: `${move.cause}; status=${move.status}; hardship=${move.hardshipLevel ?? "none"}; outcome=${move.hardshipOutcome ?? "accepted"}`,
      confidenceStatus: `distance ${move.distanceTiles}; duration ${move.durationDays}`,
      interpretationKind: "direct_state",
      relatedTileId: move.toTileId,
      reasonIds: move.reasonIds,
      cooldownTicks: 8,
    });

    const crossing = move.temporaryWatercraft;
    if (crossing !== undefined) {
      candidates.push({
        category: "movement",
        family: `river-crossing-${crossing.result}`,
        salience: crossing.result === "crossing_success" ? "medium" : crossing.result === "crossing_abandoned_risk" ? "high" : "medium",
        tone: crossing.result === "crossing_success" ? "practical" : crossing.result === "crossing_abandoned_risk" ? "tense" : "watchful",
        sourceCategory: "movement",
        summary: selectGroundedTemplate(world, band, `talk:river-crossing:${crossing.result}:${crossing.watercraftType ?? "none"}`, [
          crossing.result === "crossing_success"
            ? `The river crossing took ${crossing.shuttleTrips} shuttles because the carried load was ${crossing.carryBurden}.`
            : crossing.result === "crossing_delayed_materials"
              ? "The band delayed the move to gather material and prepare a crude crossing aid."
              : crossing.result === "materials_missing"
                ? "The crossing failed in talk before it started: the known wood, reeds, or fiber were not enough."
                : "Adults kept arguing over whether the children and elders could be ferried safely.",
          crossing.materialBasis.length > 0
            ? `${crossing.materialBasis[0]} made the crossing less abstract.`
            : "No known material made the crossing feel easy.",
          crossing.result === "crossing_abandoned_risk"
            ? "The crossing stayed a warning, not a route."
            : "The crossing is remembered as labor and risk, not a settled craft system.",
        ]),
        stateKey: `talk:river-crossing:${crossing.result}:${String(move.fromTileId)}:${String(move.toTileId)}:${crossing.watercraftType ?? "none"}`,
        whyShown: "recent residential move considered temporary river-crossing aid",
        rawSource: "ResidentialMoveEvent.temporaryWatercraft",
        rawReason: `${crossing.traceType}; ${crossing.result}; type=${crossing.watercraftType ?? "none"}; materials=${crossing.materialBasis.join("|") || "none"}; adults=${crossing.adultLabor}; dependents=${crossing.dependents}; elders=${crossing.elders}; carry=${crossing.carryBurden}; riverRisk=${round2(crossing.riverRisk)}`,
        confidenceStatus: `safety ${round2(crossing.expectedCrossingSafety)}; material ${round2(crossing.materialConfidence)}`,
        interpretationKind: "direct_state",
        relatedTileId: crossing.targetTileId ?? move.toTileId,
        reasonIds: crossing.reasonIds.length > 0 ? crossing.reasonIds : move.reasonIds,
        cooldownTicks: 8,
        rankBonus: crossing.result === "crossing_abandoned_risk" ? 0.08 : 0.04,
      });
    }
  }

  const trip = (band.recentIntraSeasonTrips ?? []).find((entry) =>
    entry.taskGroupType === "memory_refresh_group" ||
    entry.activityOutcome === "failed_due_to_water_risk" ||
    entry.activityOutcome === "abandoned_due_to_risk" ||
    entry.distanceTiles >= 3
  );
  if (trip !== undefined) {
    candidates.push({
      category: "movement",
      family: `route-${trip.activityOutcome}`,
      salience: trip.activityOutcome === "abandoned_due_to_risk" || trip.activityOutcome.startsWith("failed_due_to") ? "medium" : "low",
      tone: trip.activityOutcome === "abandoned_due_to_risk" ? "tense" : "watchful",
      sourceCategory: "movement",
      summary: selectGroundedTemplate(world, band, `talk:trip-route:${trip.activityOutcome}:${trip.taskGroupType}`, [
        trip.activityOutcome === "failed_due_to_water_risk"
          ? "The water warning made that route sound worse than the distance did."
          : trip.activityOutcome === "abandoned_due_to_risk"
            ? "Nobody likes a route that sends people back before the work starts."
            : "The scouts gave the camp more to argue about, not a simple answer.",
        trip.distanceTiles >= 3
          ? "Farther edges sound possible until people start counting the return."
          : "The route talk stays close to known ground.",
        "The line is grounded in a trip trace, not in hidden map knowledge.",
      ]),
      stateKey: `talk:route-trip:${trip.taskGroupType}:${trip.activityOutcome}:${String(trip.targetTileId)}`,
      whyShown: "recent trip changed route confidence or caution",
      rawSource: "Band.recentIntraSeasonTrips",
      rawReason: `${trip.taskGroupType}; outcome=${trip.activityOutcome}; distance=${trip.distanceTiles}; summary=${trip.activityOutcomeSummary}`,
      confidenceStatus: `return confidence ${round2(trip.resourceReturn.returnConfidence)}`,
      interpretationKind: "interpretation",
      relatedTileId: trip.targetTileId,
      reasonIds: trip.reasonIds,
      cooldownTicks: 8,
    });
  }
}

function pushStorageTalk(candidates: CampTalkCandidate[], world: WorldState, band: Band): void {
  const ecology = band.resourceEcology;
  if (ecology === undefined || ecology.storageSuitabilityCards.length === 0) {
    return;
  }

  const buffer = ecology.storageSuitabilityCards.find((card) =>
    card.broadType !== "material_hook" &&
    (card.seasonalBufferValue === "high" || card.storageSuitability === "excellent" || card.storageSuitability === "good")
  );
  if (buffer !== undefined) {
    candidates.push({
      category: "storage",
      family: `storage-buffer-${buffer.classId}`,
      salience: buffer.seasonalBufferValue === "high" ? "medium" : "low",
      tone: buffer.seasonalBufferValue === "high" ? "relieved" : "practical",
      sourceCategory: "storage",
      summary: selectGroundedTemplate(world, band, `talk:storage-buffer:${buffer.classId}`, [
        `${buffer.label} is useful because it keeps better than wet foods.`,
        `People talk about ${buffer.label} as a possible lean-season buffer, not a stored surplus.`,
        `${buffer.label} makes the next lean season feel less frightening when the band knows the patch well.`,
      ]),
      stateKey: `talk:storage-buffer:${buffer.classId}:${buffer.confidenceKind}:${stressBucket(buffer.storageConfidence)}`,
      whyShown: "known resource card has high seasonal-buffer or keeping value",
      rawSource: "Band.resourceEcology.storageSuitabilityCards",
      rawReason: `${buffer.classId}; storage=${buffer.storageSuitability}; buffer=${buffer.seasonalBufferValue}; confidence=${round2(buffer.storageConfidence)}; antiOmniscience=${buffer.antiOmniscienceStatus}`,
      confidenceStatus: `${buffer.confidenceKind} ${round2(buffer.storageConfidence)}`,
      interpretationKind: "interpretation",
      relatedTileId: buffer.sourceTileIds[0],
      reasonIds: ecology.reasonIds,
      cooldownTicks: 10,
      rankBonus: 0.04,
    });
  }

  const perishable = ecology.storageSuitabilityCards.find((card) =>
    card.perishability === "high" && card.spoilageRisk === "high"
  );
  if (perishable !== undefined) {
    candidates.push({
      category: "storage",
      family: `storage-perishable-${perishable.classId}`,
      salience: perishable.processingLabor === "high" || perishable.carryBurden === "high" ? "medium" : "low",
      tone: "watchful",
      sourceCategory: "storage",
      summary: selectGroundedTemplate(world, band, `talk:storage-perishable:${perishable.classId}`, [
        `${perishable.label} helps now, but it cannot be carried far without work.`,
        `People are tired of food that spoils before the next move.`,
        `${perishable.label} is useful immediate food, not a safe long-term store.`,
      ]),
      stateKey: `talk:storage-perishable:${perishable.classId}:${perishable.carryBurden}:${perishable.processingLabor}`,
      whyShown: "known useful resource is highly perishable or costly to process",
      rawSource: "Band.resourceEcology.storageSuitabilityCards",
      rawReason: `${perishable.classId}; perishability=${perishable.perishability}; spoilage=${perishable.spoilageRisk}; labor=${perishable.processingLabor}; carry=${perishable.carryBurden}`,
      confidenceStatus: `${perishable.confidenceKind} ${round2(perishable.storageConfidence)}`,
      interpretationKind: "interpretation",
      relatedTileId: perishable.sourceTileIds[0],
      reasonIds: ecology.reasonIds,
      cooldownTicks: 8,
    });
  }

  const material = ecology.storageSuitabilityCards.find((card) => card.crossingMaterialUse !== "none");
  if (material !== undefined) {
    candidates.push({
      category: "storage",
      family: `storage-material-${material.classId}`,
      salience: "low",
      tone: "practical",
      sourceCategory: "storage",
      summary: selectGroundedTemplate(world, band, `talk:storage-material:${material.classId}`, [
        `${material.label} matters as material for lashing, drying, shelter, or a temporary crossing aid.`,
        `${material.label} is useful around camp, but it is not food storage.`,
        `Known ${material.label} can make keeping and carrying work less awkward for a short stop.`,
      ]),
      stateKey: `talk:storage-material:${material.classId}:${material.crossingMaterialUse}`,
      whyShown: "known material-style resource has keeping/crossing relevance",
      rawSource: "Band.resourceEcology.storageSuitabilityCards",
      rawReason: `${material.classId}; materialUse=${material.crossingMaterialUse}; storage=${material.storageSuitability}; confidence=${round2(material.storageConfidence)}`,
      confidenceStatus: `${material.confidenceKind} ${round2(material.storageConfidence)}`,
      interpretationKind: "interpretation",
      relatedTileId: material.sourceTileIds[0],
      reasonIds: ecology.reasonIds,
      cooldownTicks: 12,
    });
  }
}

function pushProtoCampTalk(candidates: CampTalkCandidate[], world: WorldState, band: Band): void {
  const place = band.protoCampMemory?.currentPlace ?? band.protoCampMemory?.topPlaces[0];
  if (place === undefined || place.campLikeState === "none") {
    return;
  }
  candidates.push({
    category: "camp_place",
    family: `camp-${place.campLikeState}`,
    salience: salienceForProtoCamp(place.campLikeState),
    tone: place.campLikeState === "contested_camp_like_place" ||
      place.campLikeState === "abandoned_camp_trace" ||
      place.campLikeState === "stale_remembered_camp" ||
      place.campLikeState === "fragile_camp_like_place" ? "resigned" :
      place.campLikeState === "refuge_anchor" ||
        place.campLikeState === "seasonal_return_place" ||
        place.lifecycleTrend === "strengthening" ||
        place.lifecycleTrend === "recovering" ? "relieved" :
      "practical",
    sourceCategory: "camp_place",
    summary: selectGroundedTemplate(world, band, `talk:camp:${place.campLikeState}:${String(place.tileId)}`, [
      place.campLikeState === "refuge_anchor"
        ? "The familiar refuge is making people less eager to gamble on distance."
        : place.campLikeState === "activity_base"
          ? "Nearby work keeps pulling talk back to the same stopping place."
          : place.campLikeState === "contested_camp_like_place"
            ? "The place is useful enough to keep, and pressured enough to argue about."
            : place.campLikeState === "storage_processing_candidate"
              ? "Known food and material work make this a useful short-term processing place."
              : place.campLikeState === "crossing_camp"
                ? "A known crossing keeps pulling the route back to this bank."
                : place.campLikeState === "fragile_camp_like_place"
                  ? "The place is useful, but pressure and hardship keep it uneasy."
                  : place.lifecycleTrend === "recovering"
                    ? "The camp-like place is becoming useful again after rest."
                    : "Repeated return is making this place feel practical, not permanent.",
      place.positiveReasons[0] === undefined
        ? "The place matters through repeated use more than one dramatic reason."
        : `${place.positiveReasons[0].reason} is part of why people keep naming this place.`,
      place.negativeReasons.length > 0
        ? "The useful place is also becoming a source of complaint."
        : "The attachment is still bounded by season and work.",
    ]),
    stateKey: `talk:camp-place:${String(place.tileId)}:${place.campLikeState}:${stressBucket(place.campLikeScore)}`,
    whyShown: "proto-camp/place memory has a readable current or top place",
    rawSource: "Band.protoCampMemory",
    rawReason: `tile=${String(place.tileId)}; state=${place.campLikeState}; trend=${place.lifecycleTrend ?? "stable"}; seasonal=${place.seasonalIdentity ?? "general_return_place"}; score=${round2(place.campLikeScore)}; positives=${place.positiveReasons.map((reason) => reason.reason).join("|")}; negatives=${place.negativeReasons.map((reason) => reason.reason).join("|")}`,
    confidenceStatus: `confidence ${round2(place.confidence)}; visits ${place.visitCount}; families ${(place.reasonFamilies ?? []).map((summary) => summary.family).join("|") || "none"}`,
    interpretationKind: "interpretation",
    relatedTileId: place.tileId,
    reasonIds: place.reasonIds,
    cooldownTicks: 10,
  });
}

function pushDemographyTalk(candidates: CampTalkCandidate[], world: WorldState, band: Band): void {
  const churn = band.demography.demographicChurn;
  if (churn !== undefined) {
    if (churn.deathsThisYear > 0) {
      candidates.push({
        category: "demography",
        family: "death-churn",
        salience: "high",
        tone: "sober",
        sourceCategory: "demography",
        summary: selectGroundedTemplate(world, band, `talk:death:${churn.latestYear}:${churn.deathsThisYear}`, [
          churn.elderDeathsThisYear > 0
            ? "An elder death has made the camp quieter than the count alone shows."
            : "Deaths this year are changing how people judge risk.",
          churn.adultDeathsThisYear > 0
            ? "Losing working adults makes every trip sound heavier."
            : churn.dependentDeathsThisYear > 0
              ? "Dependent deaths make even ordinary hunger talk sharper."
              : "The death memory is practical and sober.",
          "Nobody needs a named story for the loss to matter.",
        ]),
        stateKey: `talk:demography:deaths:${churn.latestYear}:${churn.deathsThisYear}:${formatDeathCauseCounts(churn)}`,
        whyShown: "demographic churn recorded deaths this year",
        rawSource: "Band.demography.demographicChurn",
        rawReason: `deathsThisYear=${churn.deathsThisYear}; ${formatDeathCauseCounts(churn)}`,
        confidenceStatus: "direct demographic churn",
        interpretationKind: "direct_state",
        reasonIds: band.demography.sourceReasonIds,
        cooldownTicks: 4,
      });
    }

    if (churn.birthsThisYear > 0) {
      candidates.push({
        category: "demography",
        family: "birth-churn",
        salience: band.seasonalSupport?.hungerClassification === "stable" ? "low" : "medium",
        tone: band.seasonalSupport?.hungerClassification === "stable" ? "relieved" : "worried",
        sourceCategory: "demography",
        summary: selectGroundedTemplate(world, band, `talk:birth:${churn.latestYear}:${churn.birthsThisYear}`, [
          "A birth gives people a hopeful thing to mention, but it also changes the load.",
          "The camp counts the new life with caution as much as relief.",
          "Birth talk is warm, but the food margin still decides how easy it feels.",
        ]),
        stateKey: `talk:demography:births:${churn.latestYear}:${churn.birthsThisYear}:${band.seasonalSupport?.hungerClassification ?? "unknown"}`,
        whyShown: "demographic churn recorded births this year",
        rawSource: "Band.demography.demographicChurn.birthsThisYear",
        rawReason: `birthsThisYear=${churn.birthsThisYear}; hunger=${band.seasonalSupport?.hungerClassification ?? "unknown"}`,
        confidenceStatus: "direct demographic churn",
        interpretationKind: "direct_state",
        reasonIds: band.demography.sourceReasonIds,
        cooldownTicks: 4,
      });
    }
  }

  if (band.deathMemory !== undefined && band.deathMemory.deathMemorySeverity >= 0.12) {
    candidates.push({
      category: "demography",
      family: "death-memory-caution",
      salience: band.deathMemory.deathMemorySeverity >= 0.35 ? "high" : "medium",
      tone: "sober",
      sourceCategory: "demography",
      summary: selectGroundedTemplate(world, band, `talk:death-memory:${band.deathMemory.deathMemoryCause ?? "unknown"}`, [
        "Old deaths are still affecting how much risk feels acceptable.",
        "The caution is not dramatic; it is what people remember before sending groups out.",
        "The place carries a sober warning because the loss was recent enough to matter.",
      ]),
      stateKey: `talk:death-memory:${band.deathMemory.deathMemoryCause ?? "unknown"}:${stressBucket(band.deathMemory.deathMemorySeverity)}`,
      whyShown: "death memory still has caution effect",
      rawSource: "Band.deathMemory",
      rawReason: `severity=${round2(band.deathMemory.deathMemorySeverity)}; cause=${band.deathMemory.deathMemoryCause ?? "unknown"}; deaths=${band.deathMemory.recentDeathCount}`,
      confidenceStatus: `caution ${round2(band.deathMemory.cautionModifier)}`,
      interpretationKind: "interpretation",
      relatedTileId: band.deathMemory.placeTileId,
      reasonIds: band.deathMemory.reasonIds,
      cooldownTicks: 10,
    });
  }
}

function pushInnerFissionTalk(candidates: CampTalkCandidate[], world: WorldState, band: Band): void {
  const fission = band.innerFission;
  if (fission === undefined) {
    return;
  }
  if (fission.state === "unified" && fission.pressureScore < 0.28) {
    candidates.push({
      category: "inner_fission",
      family: "unity-holding",
      salience: "low",
      tone: "relieved",
      sourceCategory: "inner_fission",
      summary: selectGroundedTemplate(world, band, "talk:unity-holding", [
        "People disagree about small things, but the camp is still holding together.",
        "The group feels ordinary today because the split pressure is low.",
        "Staying together is visible mostly because nothing has forced the question.",
      ]),
      stateKey: `talk:fission:unified:${stressBucket(fission.pressureScore)}`,
      whyShown: "low fission pressure gives grounded low-stakes talk",
      rawSource: "Band.innerFission",
      rawReason: `state=${fission.state}; pressure=${round2(fission.pressureScore)}; causes=${fission.topCauses.join("|")}`,
      confidenceStatus: `pressure ${round2(fission.pressureScore)}`,
      interpretationKind: "direct_state",
      reasonIds: fission.reasonIds,
      cooldownTicks: 16,
    });
    return;
  }

  if (fission.state !== "unified") {
    candidates.push({
      category: "inner_fission",
      family: `fission-${fission.state}`,
      salience: fission.state === "near_split" || fission.state === "split_delayed" || fission.state === "factional" ? "high" : "medium",
      tone: fission.state === "split_resolved" ? "relieved" : "tense",
      sourceCategory: "inner_fission",
      summary: selectGroundedTemplate(world, band, `talk:fission:${fission.state}`, [
        fission.state === "split_delayed"
          ? "Some adults want a split, but the season makes it feel unsafe."
          : fission.state === "near_split"
            ? "The camp is close enough to splitting that ordinary disagreements sound larger."
            : fission.state === "split_resolved"
              ? "The pressure to split has eased, and people sound less sharp."
              : "The disagreement is grounded in pressure, not in a named faction story.",
        fission.topCauses[0] === undefined
          ? "Nobody can point to one clean cause."
          : `${fission.topCauses[0]} keeps coming up when people argue about staying together.`,
        "This is social strain, not law, leadership, or territory.",
      ]),
      stateKey: `talk:fission:${fission.state}:${fission.topCauses[0] ?? "none"}:${stressBucket(fission.pressureScore)}`,
      whyShown: "inner fission state is not unified",
      rawSource: "Band.innerFission",
      rawReason: `state=${fission.state}; pressure=${round2(fission.pressureScore)}; causes=${fission.topCauses.join("|")}; hooks=${fission.eventHooks.join("|")}`,
      confidenceStatus: `pressure ${round2(fission.pressureScore)}`,
      interpretationKind: "direct_state",
      reasonIds: fission.reasonIds,
      cooldownTicks: fission.state === "near_split" ? 4 : 8,
    });
  }
}

function pushSocialTalk(candidates: CampTalkCandidate[], world: WorldState, band: Band): void {
  const social = band.socialTension;
  const viability = band.viability;
  if (
    social !== undefined &&
    social.protectiveVaguenessCount > 0 &&
    social.directionBlurredCount > 0 &&
    social.crowdedKinResourcePressure >= 0.25
  ) {
    candidates.push({
      category: "social_tension",
      family: "protective-vagueness",
      salience: "medium",
      tone: "watchful",
      sourceCategory: "social_tension",
      summary: "A related band gave vague directions while food and water pressure was high. They may be protecting a crowded patch.",
      stateKey: `talk:social:vague:${social.protectiveVaguenessCount}:${social.directionBlurredCount}:${stressBucket(social.crowdedKinResourcePressure)}`,
      whyShown: "protective vagueness and direction blur under crowding pressure",
      rawSource: "Band.socialTension.protectiveVaguenessCount + directionBlurredCount + crowdedKinResourcePressure",
      rawReason: `protective_vagueness=${social.protectiveVaguenessCount}; direction_blurred=${social.directionBlurredCount}; crowded=${round2(social.crowdedKinResourcePressure)}`,
      confidenceStatus: social.protectiveVaguenessStatus,
      interpretationKind: "interpretation",
      relatedBandId: social.relationCategories.find((relation) => relation.otherBandId !== undefined)?.otherBandId,
      reasonIds: social.reasonIds,
      cooldownTicks: 8,
    });
  }

  if (social !== undefined && (social.tolerance <= 0.08 || social.socialTensionPressure >= 0.34)) {
    candidates.push({
      category: "social_tension",
      family: "social-strain",
      salience: social.tolerance <= 0.02 || social.socialTensionPressure >= 0.72 ? "high" : "medium",
      tone: social.tolerance <= 0.02 ? "tense" : "watchful",
      sourceCategory: "social_tension",
      summary: selectGroundedTemplate(world, band, `talk:social-strain:${social.cohesionStatus}:${social.toleranceStatus}`, [
        social.tolerance <= 0.02
          ? "People are not arguing loudly; the silence is the worrying part."
          : "The camp sounds watchful because trust is not carrying the pressure easily.",
        social.crowdedKinResourcePressure >= 0.35
          ? "Crowded kin and resources are making generous talk harder."
          : "The strain is ordinary and practical, not a feud story.",
        `${social.cohesionStatus}; ${social.toleranceStatus}.`,
      ]),
      stateKey: `talk:social:strain:${social.cohesionStatus}:${social.toleranceStatus}:${stressBucket(social.socialTensionPressure)}`,
      whyShown: "social tension pressure or low tolerance",
      rawSource: "Band.socialTension",
      rawReason: `cohesion=${round2(social.cohesion)}; tolerance=${round2(social.tolerance)}; pressure=${round2(social.socialTensionPressure)}; hooks=${social.eventHooks.join("|")}`,
      confidenceStatus: social.hostilityStatus,
      interpretationKind: "direct_state",
      relatedBandId: social.relationCategories.find((relation) => relation.otherBandId !== undefined)?.otherBandId,
      reasonIds: social.reasonIds,
      cooldownTicks: 8,
    });
  }

  if (viability?.supportSeekingBlockedReason !== undefined) {
    candidates.push({
      category: "social_tension",
      family: "support-blocked",
      salience: "medium",
      tone: "worried",
      sourceCategory: "social_tension",
      summary: `Support-seeking is blocked: ${viability.supportSeekingBlockedReason}.`,
      stateKey: `talk:support:block:${viability.supportSeekingBlockedReason}`,
      whyShown: "weak-band support seeking is blocked",
      rawSource: "Band.viability.supportSeekingBlockedReason",
      rawReason: viability.supportSeekingBlockedReason,
      confidenceStatus: "direct weak-band support state",
      interpretationKind: "direct_state",
      relatedBandId: viability.supportSeekingTargetBandId,
      reasonIds: viability.reasonIds,
      cooldownTicks: 8,
    });
  }

  if (viability?.supportSeekingTargetBandId !== undefined && viability.supportSeekingGrounding !== undefined) {
    candidates.push({
      category: "social_tension",
      family: "support-target",
      salience: "medium",
      tone: "practical",
      sourceCategory: "social_tension",
      summary: `Known support target: ${String(viability.supportSeekingTargetBandId)} via ${viability.supportSeekingGrounding}.`,
      stateKey: `talk:support:target:${String(viability.supportSeekingTargetBandId)}:${viability.supportSeekingGrounding}`,
      whyShown: "known support target exists",
      rawSource: "Band.viability.supportSeekingTargetBandId + supportSeekingGrounding",
      rawReason: viability.supportSeekingGrounding,
      confidenceStatus: `route confidence ${round2(viability.routeConfidenceToSupport ?? 0)}`,
      interpretationKind: "direct_state",
      relatedBandId: viability.supportSeekingTargetBandId,
      reasonIds: viability.reasonIds,
      cooldownTicks: 8,
    });
  }

  for (const relation of social?.relationCategories.slice(0, 2) ?? []) {
    if (relation.otherBandId === undefined || relation.category === "us") {
      continue;
    }
    candidates.push({
      category: "social_tension",
      family: "grounded-relation",
      salience: relation.tension >= 0.45 ? "medium" : "low",
      tone: relation.tension >= 0.45 ? "watchful" : "practical",
      sourceCategory: "social_tension",
      summary: `Grounded relation: ${String(relation.otherBandId)} is ${relation.category}.`,
      stateKey: `talk:relation:${String(relation.otherBandId)}:${relation.category}:${stressBucket(relation.tension)}`,
      whyShown: "social relation category is grounded",
      rawSource: "Band.socialTension.relationCategories",
      rawReason: relation.grounding,
      confidenceStatus: `tolerance ${round2(relation.tolerance)}; tension ${round2(relation.tension)}`,
      interpretationKind: "direct_state",
      relatedBandId: relation.otherBandId,
      reasonIds: social?.reasonIds ?? [],
      cooldownTicks: 12,
    });
  }
}

function pushAccessNormTalk(candidates: CampTalkCandidate[], world: WorldState, band: Band): void {
  const access = band.protoAccessMemory;
  const memory = access?.currentPlace ?? access?.topPlaces[0];
  if (memory === undefined || memory.accessState === "none") {
    return;
  }

  const salientReason = memory.negativeReasons[0]?.reason ?? memory.positiveReasons[0]?.reason ?? "grounded place memory";
  candidates.push({
    category: "access_norms",
    family: `access-${memory.accessState}`,
    salience: salienceForAccessState(memory.accessState),
    tone:
      memory.accessState === "contested_use" ||
      memory.accessState === "avoided_shared_use" ||
      memory.accessState === "sensitive_place" ||
      memory.accessState === "stranger_watchful" ? "watchful" :
      memory.accessState === "kin_tolerated" ||
        memory.accessState === "tolerated_shared_use" ? "practical" :
      memory.accessState === "stale_access_memory" ? "resigned" :
      "practical",
    sourceCategory: "access_norms",
    summary: selectGroundedTemplate(world, band, `talk:access:${memory.accessState}:${String(memory.tileId)}`, [
      memory.accessState === "stranger_watchful" || memory.accessState === "sensitive_place"
        ? `Unknown signs near this ${humanizeAccessPlaceType(memory.placeType)} make people more watchful.`
        : memory.accessState === "kin_tolerated"
          ? `Kin signs near this ${humanizeAccessPlaceType(memory.placeType)} cause less worry than unknown signs would.`
          : memory.accessState === "crowded_use" || memory.accessState === "contested_use"
            ? `Shared use around this ${humanizeAccessPlaceType(memory.placeType)} is raising pressure.`
            : memory.accessState === "expected_return"
              ? "Repeated return is making this place feel expected, not fixed."
              : memory.accessState === "tolerated_shared_use"
                ? "Familiar shared use is tolerated here, though pressure still matters."
                : memory.accessState === "stale_access_memory"
                  ? "A stale warning faded; the place feels less contested now."
                  : "Repeated use makes this place socially noticeable.",
      memory.placeType === "storage_processing_candidate"
        ? "The processing place is useful enough that people notice who else uses it."
        : memory.placeType === "ford_crossing"
          ? "People watch the crossing more closely during movement season."
          : `${salientReason}.`,
      "This is an expectation from memory, not a fixed rule.",
    ]),
    stateKey: `talk:access:${String(memory.tileId)}:${memory.accessState}:${stressBucket(memory.placeSensitivity)}`,
    whyShown: "proto-access memory has a salient current or remembered place",
    rawSource: "Band.protoAccessMemory",
    rawReason: `tile=${String(memory.tileId)}; state=${memory.accessState}; type=${memory.placeType}; importance=${round2(memory.accessImportance)}; sensitivity=${round2(memory.placeSensitivity)}; stranger=${round2(memory.strangerCaution)}; shared=${round2(memory.sharedUsePressure)}; reasons=${memory.topReasons.join("|")}`,
    confidenceStatus: `confidence ${round2(memory.confidence)}; stale ${round2(memory.staleness)}`,
    interpretationKind: "interpretation",
    relatedTileId: memory.tileId,
    reasonIds: memory.sourceReasonIds,
    cooldownTicks: memory.accessState === "stale_access_memory" ? 16 : 8,
    rankBonus: memory.placeSensitivity >= 0.45 ? 0.04 : 0,
  });
}

function pushRangeKnowledgeTalk(candidates: CampTalkCandidate[], world: WorldState, band: Band): void {
  const route = Object.values(band.travelCorridors).sort((left, right) => right.useCount - left.useCount || right.confidence - left.confidence)[0];
  if (route !== undefined && route.useCount >= 2) {
    candidates.push({
      category: "range_knowledge",
      family: "familiar-route",
      salience: "low",
      tone: "practical",
      sourceCategory: "range_knowledge",
      summary: selectGroundedTemplate(world, band, `talk:route-memory:${String(route.id)}`, [
        "The same route is familiar enough that people talk about it as ordinary work.",
        "Known country makes the route feel smaller than the map would suggest.",
        "The route memory is useful because it is repeated, not because it is perfect.",
      ]),
      stateKey: `talk:range:route:${String(route.id)}:${stressBucket(route.confidence)}`,
      whyShown: "travel corridor has repeated use",
      rawSource: "Band.travelCorridors",
      rawReason: `route=${String(route.id)}; uses=${route.useCount}; confidence=${round2(route.confidence)}; intents=${route.intentKinds.join("|")}`,
      confidenceStatus: `route confidence ${round2(route.confidence)}`,
      interpretationKind: "interpretation",
      relatedTileId: route.toTileId,
      reasonIds: [`reason:camp-talk:route:${String(band.id)}:${String(route.id)}` as ReasonId],
      cooldownTicks: 16,
    });
  }

  const stale = Object.values(band.placeMemory).find((memory) =>
    Number(world.time.tick) - Number(memory.lastObservedAt.tick) >= 24 &&
    memory.confidence <= 0.5
  );
  if (stale !== undefined) {
    candidates.push({
      category: "range_knowledge",
      family: "stale-place-memory",
      salience: "low",
      tone: "watchful",
      sourceCategory: "range_knowledge",
      summary: selectGroundedTemplate(world, band, `talk:stale-place:${String(stale.tileId)}`, [
        "Some old place talk is getting too stale to settle an argument.",
        "People remember the direction better than they trust the details.",
        "The known world has edges that feel familiar and uncertain at the same time.",
      ]),
      stateKey: `talk:range:stale-place:${String(stale.tileId)}:${stressBucket(stale.confidence)}`,
      whyShown: "place memory is old and low-confidence",
      rawSource: "Band.placeMemory.lastObservedAt + confidence",
      rawReason: `tile=${String(stale.tileId)}; lastTick=${Number(stale.lastObservedAt.tick)}; confidence=${round2(stale.confidence)}; valences=${stale.valences.join("|")}`,
      confidenceStatus: `confidence ${round2(stale.confidence)}`,
      interpretationKind: "interpretation",
      relatedTileId: stale.tileId,
      reasonIds: stale.reasonIds,
      cooldownTicks: 18,
    });
  }
}

function pushEverydayTalk(candidates: CampTalkCandidate[], world: WorldState, band: Band): void {
  const support = band.seasonalSupport;
  const labor = band.activityLaborSummary;
  const peopleAtCamp = labor?.peopleAtResidentialCenterEstimate ?? 0;
  const stable = support === undefined || support.hungerClassification === "stable" || support.hungerClassification === "seasonal_pulse_recovery";
  if (stable && peopleAtCamp > 0) {
    candidates.push({
      category: "everyday",
      family: "low-stakes-camp-complaint",
      salience: "low",
      tone: "light",
      sourceCategory: "everyday",
      summary: selectGroundedTemplate(world, band, `talk:everyday:${world.time.season}:${Math.floor(Number(world.time.tick) / 4)}`, [
        "Someone is tired of the same fallback food, which is a good sign compared with real hunger.",
        "The useful place is also muddy, awkward, or boring enough to complain about.",
        "People have enough margin to grumble about ordinary camp work.",
        "The camp sounds alive in small complaints because nothing worse is crowding them out.",
      ]),
      stateKey: `talk:everyday:${world.time.season}:${band.position}:${stressBucket(support?.currentSeasonSupport.foodStress ?? 0)}`,
      whyShown: "stable band with people remaining at camp",
      rawSource: "Band.activityLaborSummary + Band.seasonalSupport",
      rawReason: `peopleAtCamp=${round2(peopleAtCamp)}; hunger=${support?.hungerClassification ?? "unknown"}; season=${world.time.season}`,
      confidenceStatus: `camp labor ${round2(peopleAtCamp)}`,
      interpretationKind: "interpretation",
      relatedTileId: band.position,
      reasonIds: support?.reasonIds.length === 0 || support?.reasonIds === undefined
        ? [`reason:camp-talk:everyday:${String(band.id)}:${Number(world.time.tick)}` as ReasonId]
        : support.reasonIds,
      cooldownTicks: 16,
      rankBonus: -0.2,
    });
  }
}

function makeCampTalkItem(
  world: WorldState,
  band: Band,
  candidate: CampTalkCandidate,
  occurrenceCount: number,
  previousSuppressedCount: number,
): CampRumorReadabilityItem {
  const compressedRepeatCount = occurrenceCount >= 3 ? Math.max(previousSuppressedCount, occurrenceCount - 1) : 0;
  return {
    id: `rumor:${String(band.id)}:${Number(world.time.tick)}:${sanitizeEventKey(candidate.stateKey)}`,
    summary: compressedRepeatCount > 0
      ? compressTalkSummary(candidate.summary, candidate.family, occurrenceCount)
      : candidate.summary,
    category: candidate.category,
    family: candidate.family,
    salience: candidate.salience,
    tone: candidate.tone,
    sourceCategory: candidate.sourceCategory,
    stateKey: candidate.stateKey,
    whyShown: candidate.whyShown,
    rawSource: candidate.rawSource,
    rawReason: candidate.rawReason,
    confidenceStatus: candidate.confidenceStatus,
    interpretationKind: candidate.interpretationKind,
    relatedBandId: candidate.relatedBandId,
    relatedTileId: candidate.relatedTileId,
    reasonIds: candidate.reasonIds.slice(-8),
    occurrenceCount,
    compressedRepeatCount,
    grounded: true,
  };
}

function updateTalkLedgerRecord(
  world: WorldState,
  candidate: CampTalkCandidate,
  prior: CampTalkRepetitionRecord | undefined,
  suppressed: boolean,
): CampTalkRepetitionRecord {
  return {
    stateKey: candidate.stateKey,
    family: candidate.family,
    sourceCategory: candidate.sourceCategory,
    firstTick: prior?.firstTick ?? world.time.tick,
    lastTick: world.time.tick,
    count: (prior?.count ?? 0) + 1,
    suppressedCount: (prior?.suppressedCount ?? 0) + (suppressed ? 1 : 0),
    lastSummary: candidate.summary,
    salience: candidate.salience,
    relatedTileId: candidate.relatedTileId,
    relatedBandId: candidate.relatedBandId,
    reasonIds: uniqueStrings([...(prior?.reasonIds ?? []).map(String), ...candidate.reasonIds.map(String)]).slice(-8).map((value) => value as ReasonId),
  };
}

function compressTalkSummary(summary: string, family: string, occurrenceCount: number): string {
  if (occurrenceCount >= 8) {
    return `For several seasons, the same ${family.replace(/-/g, " ")} keeps coming back in camp talk. ${summary}`;
  }
  if (occurrenceCount >= 4) {
    return `The same ${family.replace(/-/g, " ")} is becoming familiar. ${summary}`;
  }
  return `Again, ${summary.charAt(0).toLowerCase()}${summary.slice(1)}`;
}

function compareTalkCandidates(left: CampTalkCandidate, right: CampTalkCandidate): number {
  const salience = salienceRank(right.salience) - salienceRank(left.salience);
  if (salience !== 0) {
    return salience;
  }
  const rank = (right.rankBonus ?? 0) - (left.rankBonus ?? 0);
  if (rank !== 0) {
    return rank;
  }
  const category = left.category.localeCompare(right.category);
  if (category !== 0) {
    return category;
  }
  return left.stateKey.localeCompare(right.stateKey);
}

function compareTalkLedgerRecords(left: CampTalkRepetitionRecord, right: CampTalkRepetitionRecord): number {
  const tick = Number(right.lastTick) - Number(left.lastTick);
  if (tick !== 0) {
    return tick;
  }
  const count = right.count - left.count;
  if (count !== 0) {
    return count;
  }
  return left.stateKey.localeCompare(right.stateKey);
}

function dependentLoad(band: Band): number {
  const dependents = Math.max(0, band.demography.dependents);
  const elders = Math.max(0, band.demography.elders);
  const workingAdults = Math.max(0, band.demography.workingAdults);
  return Math.min(1, (dependents + elders) / Math.max(1, dependents + elders + workingAdults));
}

export function deriveBandConditionProfile(
  world: WorldState,
  band: Band,
): BandConditionProfileState {
  const support = band.seasonalSupport;
  const viability = band.viability;
  const fission = band.innerFission;
  const social = band.socialTension;
  const deathMemory = band.deathMemory;
  const drivers: string[] = [];
  const rawSources: string[] = [];

  if (support !== undefined && support.hungerClassification !== "stable") {
    drivers.push(translateHungerClassification(support.hungerClassification));
    rawSources.push("Band.seasonalSupport");
  }

  if (deathMemory !== undefined && deathMemory.deathMemorySeverity >= 0.05) {
    drivers.push(`recent deaths are raising caution (${deathMemory.deathMemoryCause ?? "cause unknown"})`);
    rawSources.push("Band.deathMemory");
  }

  if (band.acuteRisk?.latestEpisode !== undefined && band.acuteRisk.activeEffect.recoverySeasons > 0) {
    drivers.push(translateAcuteRiskEpisode(band.acuteRisk.latestEpisode));
    rawSources.push("Band.acuteRisk");
  }

  if (viability?.weakBandFate !== undefined && viability.weakBandFate !== "viable") {
    drivers.push(translateWeakBandFate(viability.weakBandFate, viability.weakBandClassification));
    rawSources.push("Band.viability");
  }

  if (fission !== undefined && fission.state !== "unified") {
    drivers.push(translateInnerFissionState(fission.state));
    rawSources.push("Band.innerFission");
  }

  if (social !== undefined && social.socialTensionPressure >= 0.25) {
    drivers.push(translateSocialTension(social));
    rawSources.push("Band.socialTension");
  }

  if (band.protoCampMemory?.currentPlace !== undefined && band.protoCampMemory.currentPlace.campLikeState !== "none") {
    drivers.push(translateProtoCampState(band.protoCampMemory.currentPlace.campLikeState));
    rawSources.push("Band.protoCampMemory");
  }

  const survivalCondition = support === undefined
    ? "Seasonal support has not been evaluated yet."
    : translateHungerClassification(support.hungerClassification);
  const internalCondition = fission === undefined
    ? "Internal fission pressure has not been evaluated yet."
    : translateInnerFissionState(fission.state);
  const weakBandCondition = viability?.weakBandFate === undefined
    ? "Weak-band fate has not been evaluated yet."
    : translateWeakBandFate(viability.weakBandFate, viability.weakBandClassification);
  const socialCondition = social === undefined
    ? "Social tension has not been evaluated yet."
    : translateSocialTension(social);
  const campCondition = band.protoCampMemory?.currentPlace === undefined || band.protoCampMemory.currentPlace.campLikeState === "none"
    ? undefined
    : translateProtoCampState(band.protoCampMemory.currentPlace.campLikeState);
  const summary = buildConditionSummary(band, survivalCondition, internalCondition, weakBandCondition, socialCondition, campCondition);

  return {
    bandId: band.id,
    lastUpdatedTick: world.time.tick,
    summary,
    survivalCondition,
    internalCondition,
    weakBandCondition,
    socialCondition: campCondition === undefined ? socialCondition : `${socialCondition} ${campCondition}`,
    topDrivers: drivers.slice(0, 5),
    rawSources: uniqueStrings(rawSources),
    reasonIds: collectProfileReasonIds(band),
  };
}

export function deriveBandLineageReadability(
  world: WorldState,
  band: Band,
): BandLineageReadabilityState {
  const lineagePath = buildLineagePath(world, band);
  const originBandId = lineagePath[0] ?? band.id;
  const generationDepth = Math.max(0, lineagePath.length - 1);
  const relationCategory = band.parentBandId === undefined
    ? "us"
    : findLineageRelationCategory(band);
  const activeStatus: BandLineageReadabilityState["activeStatus"] =
    band.viability?.status === "absorbed" ? "absorbed" :
    band.viability?.status === "extinct" ? "extinct" :
    band.status === "dispersed" ? "dispersed" :
    "active";
  const generationLabel = formatGenerationLabel(generationDepth);

  return {
    bandId: band.id,
    lastUpdatedTick: world.time.tick,
    originBandId,
    parentBandId: band.parentBandId,
    daughterBandIds: band.daughterBandIds,
    generationDepth,
    generationLabel,
    lineagePath,
    activeStatus,
    absorbedByBandId: band.viability?.absorbedByBandId,
    relationCategory,
    displayLabel:
      generationDepth === 0
        ? "origin band"
        : `${generationLabel} of ${String(originBandId)}`,
    rawSource: "Band.parentBandId + daughterBandIds + lineage + viability status",
  };
}

function deriveBandEventCandidates(world: WorldState, band: Band): readonly BandReadableEventCandidate[] {
  return [
    ...deriveSurvivalEvents(band),
    ...deriveDemographyEvents(band),
    ...deriveMovementEvents(world, band),
    ...deriveActivityEvents(world, band),
    ...deriveForagingAdaptationEvents(band),
    ...deriveBodyLogisticsEvents(band),
    ...deriveRelationshipMemoryEvents(band),
    ...deriveWeakBandEvents(band),
    ...deriveDeathMemoryEvents(band),
    ...deriveInnerFissionEvents(band),
    ...deriveSocialTensionEvents(band),
    ...deriveAccessNormEvents(band),
    ...deriveLineageEvents(band),
    ...deriveProtoCampEvents(band),
    ...deriveResourceEcologyEvents(band),
    ...deriveVisibleNatureEvents(world, band),
    ...deriveAcuteRiskEvents(world, band),
  ];
}

function deriveForagingAdaptationEvents(band: Band): readonly BandReadableEventCandidate[] {
  const adaptation = band.foragingAdaptation;

  if (adaptation === undefined || adaptation.reasonIds.length === 0 || adaptation.mode === "stable") {
    return [];
  }

  const events: BandReadableEventCandidate[] = [];
  const fallback = adaptation.fallbackCandidates[0];
  if (fallback !== undefined) {
    events.push({
      category: "adaptation",
      salience: fallback.level === "emergency" || adaptation.mode === "desperate" ? "high" : fallback.level === "expanded" ? "medium" : "low",
      title: "Fallback diet widened",
      description: fallback.riskCost >= 0.45
        ? "Hunger made a risky fallback worth cautious testing, but the risk remains visible."
        : "Food pressure made lower-value resources more relevant.",
      detail: `mode ${adaptation.mode}; class ${fallback.resourceClassId}; level ${fallback.level}; labor ${round2(fallback.laborCost)}; risk ${round2(fallback.riskCost)}; quality penalty ${round2(fallback.dietQualityPenalty)}; usefulness ${round2(fallback.expectedUsefulness)}`,
      stateKey: `adaptation:fallback:${fallback.resourceClassId}:${fallback.level}:${stressBucket(adaptation.hungerSeverity)}`,
      rawSource: "Band.foragingAdaptation.fallbackCandidates",
      rawReason: fallback.reason,
      sourceReasonIds: fallback.reasonIds,
      relatedTileId: fallback.tileId,
      repeatWindowTicks: fallback.level === "emergency" ? 4 : 8,
    });
  }

  const learning = adaptation.learningRecords.find((record) => record.status === "watched" || record.status === "known_poor" || record.status === "known_risky" || record.status === "cautiously_known");
  if (learning !== undefined && (learning.proximityCount >= 3 || learning.testCount > 0)) {
    events.push({
      category: "adaptation",
      salience: learning.status === "known_risky" ? "medium" : "low",
      title: "Local resource learned empirically",
      description: learning.status === "known_risky"
        ? "Repeated observation made a risky resource recognizable, not safe."
        : "Repeated local exposure reduced resource uncertainty.",
      detail: `tile ${String(learning.tileId)}; class ${learning.resourceClassId}; status ${learning.status}; prior ${learning.knowledgeState}; source ${learning.source}; proximity ${learning.proximityCount}; tests ${learning.testCount}; gated ${learning.gatedReason}; unlock ${learning.unlockHint}`,
      stateKey: `adaptation:learning:${String(learning.tileId)}:${learning.status}:${stressBucket(learning.confidence)}`,
      rawSource: "Band.foragingAdaptation.learningRecords",
      rawReason: `empirical learning from known tile/resource memory; hidden truth used=false`,
      sourceReasonIds: learning.reasonIds,
      relatedTileId: learning.tileId,
      repeatWindowTicks: 12,
    });
  }

  const badTrip = adaptation.tripFailureMemories.find((memory) => memory.action === "abandon_temporarily" || memory.action === "reduce_confidence");
  if (badTrip !== undefined) {
    events.push({
      category: "adaptation",
      salience: badTrip.action === "abandon_temporarily" ? "medium" : "low",
      title: badTrip.action === "abandon_temporarily" ? "Poor route rested" : "Trip confidence reduced",
      description: badTrip.action === "abandon_temporarily"
        ? "A repeated low-return trip target is being abandoned for now."
        : "Repeated underperformance lowered trust in a target.",
      detail: `task ${badTrip.taskGroupType}; failures ${badTrip.failureCount}; low returns ${badTrip.lowReturnCount}; successes ${badTrip.successCount}; mean return ${round2(badTrip.meanReturn)}; distance ${badTrip.longestDistanceTiles}; penalty ${round2(badTrip.confidencePenalty)}; recovered ${badTrip.recoveredBySuccess}`,
      stateKey: `adaptation:trip:${String(badTrip.tileId)}:${badTrip.action}:${badTrip.failureCount}:${badTrip.lowReturnCount}`,
      rawSource: "Band.foragingAdaptation.tripFailureMemories",
      rawReason: "recent activity trace outcomes repeatedly underperformed",
      sourceReasonIds: badTrip.reasonIds,
      relatedTileId: badTrip.tileId,
      repeatWindowTicks: 8,
    });
  }

  const probe = adaptation.nearbyOpportunityProbes.find((entry) => entry.comparison === "nearby_probe");
  if (probe !== undefined) {
    events.push({
      category: "adaptation",
      salience: "low",
      title: "Nearby opportunity probed",
      description: "A close known alternative is becoming easier to test under local pressure.",
      detail: `tile ${String(probe.tileId)}; distance ${probe.distanceTiles}; readiness ${round2(probe.probeReadiness)}; relative opportunity ${round2(probe.relativeOpportunity)}; over-capacity ${round2(probe.currentOverCapacity)}; risk ${round2(probe.riskPenalty)}; confidence ${round2(probe.confidence)}`,
      stateKey: `adaptation:probe:${String(probe.tileId)}:${stressBucket(probe.probeReadiness)}`,
      rawSource: "Band.foragingAdaptation.nearbyOpportunityProbes",
      rawReason: "band-known nearby tile has better observed potential while current range is pressured",
      sourceReasonIds: probe.reasonIds,
      relatedTileId: probe.tileId,
      repeatWindowTicks: 10,
    });
  }

  if (adaptation.crisisBreakaway.pressure >= 0.55) {
    events.push({
      category: "adaptation",
      salience: adaptation.crisisBreakaway.active ? "high" : "medium",
      title: "Crisis breakaway pressure",
      description: "Severe scarcity is making a risky breakaway thinkable below the ordinary peaceful split threshold.",
      detail: `pressure ${round2(adaptation.crisisBreakaway.pressure)}; below ordinary threshold ${adaptation.crisisBreakaway.belowPeacefulFissionThreshold}; severe grounded pressure ${adaptation.crisisBreakaway.severeGroundedPressure}; adult labor enough ${adaptation.crisisBreakaway.adultLaborEnough}; no safe accepted solution ${adaptation.crisisBreakaway.noSafeAcceptedSolution}; destination ${String(adaptation.crisisBreakaway.knownRiskyDestination ?? "none")}`,
      stateKey: `adaptation:breakaway:${stressBucket(adaptation.crisisBreakaway.pressure)}:${adaptation.crisisBreakaway.active}`,
      rawSource: "Band.foragingAdaptation.crisisBreakaway",
      rawReason: "hunger streak, repeated failure, range pressure, and known risky opportunity",
      sourceReasonIds: adaptation.crisisBreakaway.reasonIds,
      relatedTileId: adaptation.crisisBreakaway.knownRiskyDestination,
      repeatWindowTicks: 6,
    });
  }

  if (adaptation.mode === "recovering") {
    events.push({
      category: "adaptation",
      salience: "low",
      title: "Desperation easing",
      description: "Recovery lowered risk tolerance again after pressure eased.",
      detail: `recovery ${round2(adaptation.recoverySignal)}; hunger ${round2(adaptation.hungerSeverity)}; risk modifier ${round2(adaptation.behavior.riskToleranceModifier)}; fallback bias ${round2(adaptation.behavior.fallbackExpansionBias)}`,
      stateKey: `adaptation:recovering:${stressBucket(adaptation.recoverySignal)}:${stressBucket(adaptation.hungerSeverity)}`,
      rawSource: "Band.foragingAdaptation",
      rawReason: "current pressure eased after a hungrier adaptation state",
      sourceReasonIds: adaptation.reasonIds,
      repeatWindowTicks: 8,
    });
  }

  return events.slice(0, 4);
}

function deriveBodyLogisticsEvents(band: Band): readonly BandReadableEventCandidate[] {
  const logistics = band.bodyCampLogistics;

  if (logistics === undefined || logistics.reasonIds.length === 0 || logistics.mode === "stable") {
    return [];
  }

  const events: BandReadableEventCandidate[] = [];
  const weather = logistics.weatherMemories[0];
  if (weather !== undefined && weather.strength >= 0.32) {
    events.push({
      category: "body_logistics",
      salience: weather.strength >= 0.62 ? "medium" : "low",
      title: "Weather memory affects logistics",
      description: weather.trend === "recovered"
        ? "A remembered weather hardship is fading after safer seasons."
        : "Remembered weather hardship is changing route, fire, or care caution.",
      detail: `kind ${weather.kind}; strength ${round2(weather.strength)}; trend ${weather.trend}; route caution ${round2(weather.routeCaution)}; fire need ${round2(weather.fireNeed)}; child/elder risk ${round2(weather.childElderRisk)}; source ${weather.source}`,
      stateKey: `body-logistics:weather:${weather.kind}:${weather.trend}:${stressBucket(weather.strength)}`,
      rawSource: "Band.bodyCampLogistics.weatherMemories",
      rawReason: weather.source,
      sourceReasonIds: weather.sourceReasonIds,
      repeatWindowTicks: 10,
    });
  }

  if (logistics.fire.status !== "not_relevant" && (logistics.fire.need >= 0.32 || logistics.fire.status === "risky" || logistics.fire.status === "limited_by_fuel")) {
    events.push({
      category: "body_logistics",
      salience: logistics.fire.status === "risky" || logistics.fire.status === "limited_by_fuel" ? "medium" : "low",
      title: "Fire work is salient",
      description: logistics.fire.status === "limited_by_fuel"
        ? "Fire would help, but fuel pressure and labor limit it."
        : logistics.fire.status === "risky"
          ? "Fire is useful, but dry-risk makes it watchful work."
          : "Fire is helping with warmth, smoke, or processing in a bounded way.",
      detail: `status ${logistics.fire.status}; need ${round2(logistics.fire.need)}; usefulness ${round2(logistics.fire.usefulness)}; fuel ${round2(logistics.fire.fuelBasis)}; processing ${round2(logistics.fire.processingValue)}; fuel pressure ${round2(logistics.fire.fuelPressure)}; labor ${round2(logistics.fire.laborCost)}; risk ${round2(logistics.fire.fireRisk)}`,
      stateKey: `body-logistics:fire:${logistics.fire.status}:${stressBucket(logistics.fire.need)}:${stressBucket(logistics.fire.fireRisk)}`,
      rawSource: "Band.bodyCampLogistics.fire",
      rawReason: "fire need from known material, season, weather memory, processing, and camp pressure",
      sourceReasonIds: logistics.fire.reasonIds,
      repeatWindowTicks: 10,
    });
  }

  if (logistics.sickness.active) {
    events.push({
      category: "body_logistics",
      salience: logistics.sickness.severity >= 0.55 ? "high" : "medium",
      title: "Sickness wave",
      description: "A bounded aggregate sickness wave is reducing spare labor and raising care burden.",
      detail: `severity ${round2(logistics.sickness.severity)}; duration ${logistics.sickness.durationEstimate}; causes ${logistics.sickness.causeKinds.join(",")}; activity penalty ${round2(logistics.sickness.activityPenalty)}; care ${round2(logistics.sickness.careBurden)}; travel caution ${round2(logistics.sickness.travelCaution)}; mortality bump ${round2(logistics.sickness.mortalityPressureBump)}; recovery ${round2(logistics.sickness.recoverySignal)}`,
      stateKey: `body-logistics:sickness:${stressBucket(logistics.sickness.severity)}:${logistics.sickness.causeKinds.join("-")}`,
      rawSource: "Band.bodyCampLogistics.sickness",
      rawReason: "bad water, spoilage, risky fallback, exposure, camp waste, crowding, or poor diet causes",
      sourceReasonIds: logistics.sickness.reasonIds,
      repeatWindowTicks: 6,
    });
  }

  if (logistics.logisticCapacity.state === "strained" || logistics.logisticCapacity.state === "overloaded") {
    events.push({
      category: "body_logistics",
      salience: logistics.logisticCapacity.state === "overloaded" ? "high" : "medium",
      title: "Carrying logistics strained",
      description: "Adult labor, care work, carrying load, or crossing burden is limiting what the band can safely do.",
      detail: `state ${logistics.logisticCapacity.state}; capacity ${round2(logistics.logisticCapacity.capacity)}; spare adult labor ${round2(logistics.logisticCapacity.spareAdultLabor)}; carry ${round2(logistics.logisticCapacity.carryingLoad)}; process ${round2(logistics.logisticCapacity.processingLoad)}; travel ${round2(logistics.logisticCapacity.travelLoad)}; crossing ${round2(logistics.logisticCapacity.crossingLoad)}; care ${round2(logistics.logisticCapacity.careLoad)}; reason ${logistics.logisticCapacity.limitingReason}`,
      stateKey: `body-logistics:capacity:${logistics.logisticCapacity.state}:${stressBucket(1 - logistics.logisticCapacity.capacity)}`,
      rawSource: "Band.bodyCampLogistics.logisticCapacity",
      rawReason: logistics.logisticCapacity.limitingReason,
      sourceReasonIds: logistics.logisticCapacity.reasonIds,
      repeatWindowTicks: 8,
    });
  }

  if (logistics.campCleanliness.pressure >= 0.42) {
    events.push({
      category: "body_logistics",
      salience: logistics.campCleanliness.pressure >= 0.62 ? "medium" : "low",
      title: "Camp waste pressure",
      description: logistics.campCleanliness.state === "recovering"
        ? "Camp cleanliness pressure is easing after rest or lighter use."
        : "Repeated use, wet ground, processing waste, sickness, or scavenger signs are making the camp less comfortable.",
      detail: `state ${logistics.campCleanliness.state}; pressure ${round2(logistics.campCleanliness.pressure)}; repeated ${round2(logistics.campCleanliness.repeatedStayLoad)}; wet ${round2(logistics.campCleanliness.wetCampLoad)}; processing ${round2(logistics.campCleanliness.processingWasteLoad)}; scavenger ${round2(logistics.campCleanliness.scavengerPressure)}; recovery ${round2(logistics.campCleanliness.recovery)}`,
      stateKey: `body-logistics:cleanliness:${logistics.campCleanliness.state}:${stressBucket(logistics.campCleanliness.pressure)}`,
      rawSource: "Band.bodyCampLogistics.campCleanliness",
      rawReason: "repeated camp use, wet camp, processing waste, sickness, scavenger pressure, and recovery",
      sourceReasonIds: logistics.campCleanliness.reasonIds,
      relatedTileId: band.position,
      repeatWindowTicks: 10,
    });
  }

  const task = logistics.seasonalTasks[0];
  if (task !== undefined && task.urgency >= 0.42) {
    events.push({
      category: "body_logistics",
      salience: task.urgency >= 0.64 ? "medium" : "low",
      title: "Seasonal task priority",
      description: task.reason,
      detail: `category ${task.category}; urgency ${round2(task.urgency)}; source ${task.source}; mode ${logistics.mode}`,
      stateKey: `body-logistics:task:${task.category}:${stressBucket(task.urgency)}`,
      rawSource: "Band.bodyCampLogistics.seasonalTasks",
      rawReason: task.source,
      sourceReasonIds: task.reasonIds,
      repeatWindowTicks: 12,
    });
  }

  return events.slice(0, 5);
}

function deriveRelationshipMemoryEvents(band: Band): readonly BandReadableEventCandidate[] {
  const memory = band.relationshipMemory;

  if (memory === undefined || memory.reasonIds.length === 0 || memory.mode === "quiet") {
    return [];
  }

  const events: BandReadableEventCandidate[] = [];
  const skill = memory.practiceSkills[0];
  if (skill !== undefined && skill.status !== "watched") {
    events.push({
      category: "relationship_memory",
      salience: skill.status === "reliable" || skill.status === "strained" ? "medium" : "low",
      title: "Practice memory changed",
      description: `${humanizeLogistics(skill.skill)} is ${humanizeLogistics(skill.status)} from repeated grounded activity.`,
      detail: `practice ${round2(skill.practice)}; confidence ${round2(skill.confidence)}; successes ${skill.successCount}; failures ${skill.failureCount}; stale ${round2(skill.staleRisk)}; effect ${round2(skill.effect)}; basis ${skill.basis}`,
      stateKey: `relationship:skill:${skill.skill}:${skill.status}:${stressBucket(skill.practice)}`,
      rawSource: "Band.relationshipMemory.practiceSkills",
      rawReason: skill.basis,
      sourceReasonIds: skill.reasonIds,
      repeatWindowTicks: 14,
    });
  }

  const animal = memory.animalFamiliarity[0];
  if (animal !== undefined && (animal.risk >= 0.38 || animal.humanLearning >= 0.28 || animal.campFollowing >= 0.24)) {
    events.push({
      category: "relationship_memory",
      salience: animal.risk >= 0.55 || animal.campFollowing >= 0.4 ? "medium" : "low",
      title: "Animal familiarity changed",
      description: `${animal.label} are being read as ${humanizeLogistics(animal.kind)} through visible signs and recent activity.`,
      detail: `learning ${round2(animal.humanLearning)}; wariness ${round2(animal.animalWariness)}; camp edge ${round2(animal.campFollowing)}; risk ${round2(animal.risk)}; source tiles ${animal.sourceTileIds.map(String).join(",")}; basis ${animal.basis}`,
      stateKey: `relationship:animal:${animal.stockId}:${animal.kind}:${stressBucket(animal.risk + animal.campFollowing)}`,
      rawSource: "Band.relationshipMemory.animalFamiliarity",
      rawReason: animal.basis,
      sourceReasonIds: animal.reasonIds,
      relatedTileId: animal.sourceTileIds[0],
      repeatWindowTicks: 12,
    });
  }

  const scavenger = memory.scavengerPatterns[0];
  if (scavenger !== undefined && scavenger.pressure >= 0.22) {
    events.push({
      category: "relationship_memory",
      salience: scavenger.risk >= 0.42 ? "medium" : "low",
      title: "Camp-edge animal pattern",
      description: "Camp waste, processing, sickness, or visible animal signs made camp-edge scavenging pressure noticeable.",
      detail: `kind ${scavenger.kind}; pressure ${round2(scavenger.pressure)}; risk ${round2(scavenger.risk)}; opportunity ${round2(scavenger.opportunity)}; basis ${scavenger.basis}`,
      stateKey: `relationship:scavenger:${scavenger.kind}:${stressBucket(scavenger.pressure)}`,
      rawSource: "Band.relationshipMemory.scavengerPatterns",
      rawReason: scavenger.basis,
      sourceReasonIds: scavenger.reasonIds,
      relatedTileId: scavenger.tileId,
      repeatWindowTicks: 12,
    });
  }

  const aggregation = memory.seasonalAggregations[0];
  if (aggregation !== undefined && aggregation.intensity >= 0.24) {
    events.push({
      category: "relationship_memory",
      salience: aggregation.intensity >= 0.52 || aggregation.tension >= 0.48 ? "medium" : "low",
      title: "Temporary seasonal gathering",
      description: "A rich seasonal place is pulling shared use for a short time.",
      detail: `tile ${String(aggregation.tileId)}; trigger ${aggregation.trigger}; intensity ${round2(aggregation.intensity)}; tolerance ${round2(aggregation.tolerance)}; tension ${round2(aggregation.tension)}; duration ${aggregation.expectedDuration}; dispersal ${round2(aggregation.dispersalSignal)}; basis ${aggregation.basis}`,
      stateKey: `relationship:gathering:${String(aggregation.tileId)}:${aggregation.trigger}:${stressBucket(aggregation.intensity)}`,
      rawSource: "Band.relationshipMemory.seasonalAggregations",
      rawReason: aggregation.basis,
      sourceReasonIds: aggregation.reasonIds,
      relatedTileId: aggregation.tileId,
      repeatWindowTicks: 12,
    });
  }

  const failure = memory.failureStories[0];
  if (failure !== undefined && failure.strength >= 0.28) {
    events.push({
      category: "relationship_memory",
      salience: failure.strength >= 0.6 ? "medium" : "low",
      title: "Failure story remembered",
      description: failure.trend === "stale"
        ? "A practical warning is becoming stale because it has not been reinforced."
        : failure.phrase,
      detail: `kind ${failure.kind}; strength ${round2(failure.strength)}; stale ${round2(failure.staleness)}; trend ${failure.trend}; caution ${round2(failure.caution)}; basis ${failure.basis}`,
      stateKey: `relationship:failure:${failure.kind}:${failure.trend}:${stressBucket(failure.strength)}`,
      rawSource: "Band.relationshipMemory.failureStories",
      rawReason: failure.basis,
      sourceReasonIds: failure.reasonIds,
      relatedTileId: failure.tileId,
      repeatWindowTicks: 16,
    });
  }

  const place = memory.placeCharacters[0];
  if (place !== undefined && place.salience >= 0.22) {
    events.push({
      category: "relationship_memory",
      salience: place.salience >= 0.52 || place.pressure >= 0.5 ? "medium" : "low",
      title: "Place character visible",
      description: `${place.label} is emerging from repeated practical conditions.`,
      detail: `tile ${String(place.tileId)}; kind ${place.kind}; salience ${round2(place.salience)}; confidence ${round2(place.confidence)}; pressure ${round2(place.pressure)}; recovery ${round2(place.recovery)}; basis ${place.basis}`,
      stateKey: `relationship:place:${String(place.tileId)}:${place.kind}:${stressBucket(place.salience)}`,
      rawSource: "Band.relationshipMemory.placeCharacters",
      rawReason: place.basis,
      sourceReasonIds: place.reasonIds,
      relatedTileId: place.tileId,
      repeatWindowTicks: 14,
    });
  }

  const reputation = memory.reputations[0];
  if (reputation !== undefined && (reputation.tension >= 0.25 || reputation.trust >= 0.25 || reputation.sharedUse >= 0.25)) {
    events.push({
      category: "relationship_memory",
      salience: reputation.tension >= 0.48 ? "medium" : "low",
      title: "Band reputation remembered",
      description: `${String(reputation.otherBandId)} is remembered as ${humanizeLogistics(reputation.kind)} from this band's own contact memory.`,
      detail: `familiarity ${round2(reputation.familiarity)}; trust ${round2(reputation.trust)}; tension ${round2(reputation.tension)}; shared use ${round2(reputation.sharedUse)}; stale ${round2(reputation.staleness)}; basis ${reputation.basis}`,
      stateKey: `relationship:reputation:${String(reputation.otherBandId)}:${reputation.kind}:${stressBucket(reputation.tension + reputation.trust)}`,
      rawSource: "Band.relationshipMemory.reputations",
      rawReason: reputation.basis,
      sourceReasonIds: reputation.reasonIds,
      relatedBandId: reputation.otherBandId,
      repeatWindowTicks: 14,
    });
  }

  const absorption = memory.absorptionDetails[0];
  if (absorption !== undefined) {
    events.push({
      category: "relationship_memory",
      salience: absorption.pressure >= 0.5 ? "medium" : "low",
      title: "Absorption detail visible",
      description: `A weak-band fate is readable as ${humanizeLogistics(absorption.kind)}.`,
      detail: `target ${String(absorption.targetBandId ?? "none")}; absorbed by ${String(absorption.absorbedByBandId ?? "none")}; pressure ${round2(absorption.pressure)}; labor gain ${round2(absorption.laborGain)}; care ${round2(absorption.careBurden)}; sharing ${round2(absorption.sharingStrain)}; basis ${absorption.basis}`,
      stateKey: `relationship:absorption:${absorption.kind}:${String(absorption.targetBandId ?? absorption.absorbedByBandId ?? "none")}`,
      rawSource: "Band.relationshipMemory.absorptionDetails",
      rawReason: absorption.basis,
      sourceReasonIds: absorption.reasonIds,
      relatedBandId: absorption.targetBandId ?? absorption.absorbedByBandId,
      repeatWindowTicks: 9999,
    });
  }

  const route = memory.routeFamiliarity[0];
  if (route !== undefined && route.confidence >= 0.22) {
    events.push({
      category: "relationship_memory",
      salience: route.status === "rewritten" || route.status === "strained" ? "medium" : "low",
      title: "Route memory changed",
      description: route.status === "rewritten"
        ? "A bad segment weakened confidence in a familiar passage."
        : "Repeated passage made a familiar way easier to judge.",
      detail: `from ${String(route.fromTileId)}; to ${String(route.toTileId)}; kind ${route.kind}; status ${route.status}; confidence ${round2(route.confidence)}; ease ${round2(route.ease)}; risk ${round2(route.risk)}; use ${route.useCount}; failures ${route.failureCount}; basis ${route.basis}`,
      stateKey: `relationship:route:${String(route.fromTileId)}:${String(route.toTileId)}:${route.status}`,
      rawSource: "Band.relationshipMemory.routeFamiliarity",
      rawReason: route.basis,
      sourceReasonIds: route.reasonIds,
      relatedTileId: route.toTileId,
      repeatWindowTicks: 14,
    });
  }

  return events.slice(0, 5);
}

function deriveSurvivalEvents(band: Band): readonly BandReadableEventCandidate[] {
  const support = band.seasonalSupport;
  if (support === undefined) {
    return [];
  }

  const current = support.currentSeasonSupport;
  const events: BandReadableEventCandidate[] = [];

  if (support.hungerClassification !== "stable") {
    events.push({
      category: "survival",
      salience: salienceForHunger(support.hungerClassification),
      title: titleForHunger(support.hungerClassification),
      description: translateHungerClassification(support.hungerClassification),
      detail: `raw support ${round2(current.rawSupportRatio)}; clamped ${round2(current.clampedSupportRatio)}; food stress ${round2(current.foodStress)}; water stress ${round2(current.waterStress)}; 4-season return ${round2(support.rolling4SeasonReturn)}; 8-season return ${round2(support.rolling8SeasonReturn)}`,
      stateKey: `survival:${support.hungerClassification}:${current.mode}`,
      rawSource: "Band.seasonalSupport.hungerClassification",
      rawReason: `${support.hungerClassification}; mode=${current.mode}; reasons=${support.topSeasonalSupportReasons.join("|")}`,
      sourceReasonIds: support.reasonIds,
      repeatWindowTicks: 8,
    });
  }

  if (current.waterStress >= 0.65) {
    events.push({
      category: "survival",
      salience: current.waterStress >= 0.82 ? "high" : "medium",
      title: "Water stress",
      description: current.mode === "dry"
        ? "The band is clinging to reliable water."
        : "Water stress is shaping survival pressure.",
      detail: `water stress ${round2(current.waterStress)}; season ${current.season}; mode ${current.mode}`,
      stateKey: `water:${stressBucket(current.waterStress)}:${current.mode}`,
      rawSource: "Band.seasonalSupport.currentSeasonSupport.waterStress",
      rawReason: `waterStress=${round2(current.waterStress)}`,
      sourceReasonIds: support.reasonIds,
      repeatWindowTicks: 8,
    });
  }

  return events;
}

function deriveDemographyEvents(band: Band): readonly BandReadableEventCandidate[] {
  const churn = band.demography.demographicChurn;
  if (churn === undefined) {
    return [];
  }

  const events: BandReadableEventCandidate[] = [];
  if (churn.birthsThisYear > 0) {
    events.push({
      category: "demography",
      salience: "medium",
      title: "Births recorded",
      description: `${churn.birthsThisYear} birth${churn.birthsThisYear === 1 ? "" : "s"} recorded this year.`,
      detail: `births last 10 years ${churn.birthsLast10Years}; fertility pressure ${round2(band.demography.fertilityPressure)}`,
      stateKey: `births:${churn.latestYear}:${churn.birthsThisYear}`,
      rawSource: "Band.demography.demographicChurn.birthsThisYear",
      rawReason: `birthsThisYear=${churn.birthsThisYear}`,
      sourceReasonIds: band.demography.sourceReasonIds,
      repeatWindowTicks: 4,
    });
  }

  if (churn.deathsThisYear > 0) {
    events.push({
      category: "demography",
      salience: "high",
      title: "Deaths recorded",
      description: describeChurnDeaths(churn),
      detail: `deaths last 10 years ${churn.deathsLast10Years}; causes this year: ${formatDeathCauseCounts(churn)}`,
      stateKey: `deaths:${churn.latestYear}:${churn.deathsThisYear}:${formatDeathCauseCounts(churn)}`,
      rawSource: "Band.demography.demographicChurn.deathsThisYear + cause counts",
      rawReason: `deathsThisYear=${churn.deathsThisYear}; ${formatDeathCauseCounts(churn)}`,
      sourceReasonIds: band.demography.sourceReasonIds,
      repeatWindowTicks: 4,
    });
  }

  const transitions = churn.dependentsMaturedThisYear + churn.adultsAgedThisYear;
  if (transitions >= 2) {
    events.push({
      category: "demography",
      salience: "medium",
      title: "Cohorts shifted",
      description: "Age cohorts changed enough to affect the working balance.",
      detail: `matured ${churn.dependentsMaturedThisYear}; aged into elders ${churn.adultsAgedThisYear}`,
      stateKey: `cohorts:${churn.latestYear}:${transitions}`,
      rawSource: "Band.demography.demographicChurn cohort transitions",
      rawReason: `dependentsMatured=${churn.dependentsMaturedThisYear}; adultsAged=${churn.adultsAgedThisYear}`,
      sourceReasonIds: band.demography.sourceReasonIds,
      repeatWindowTicks: 4,
    });
  }

  if (churn.stablePopulationHidesChurn) {
    events.push({
      category: "demography",
      salience: "medium",
      title: "Stable headcount hides churn",
      description: "The headcount looks stable, but births and deaths are offsetting each other.",
      detail: `births ${churn.birthsLast10Years}; deaths ${churn.deathsLast10Years}; net ${churn.netPopulationChangeLast10Years}`,
      stateKey: `hidden-churn:${churn.latestYear}`,
      rawSource: "Band.demography.demographicChurn.stablePopulationHidesChurn",
      rawReason: `births10=${churn.birthsLast10Years}; deaths10=${churn.deathsLast10Years}; net10=${churn.netPopulationChangeLast10Years}`,
      sourceReasonIds: band.demography.sourceReasonIds,
      repeatWindowTicks: 4,
    });
  }

  const noDeathAudit = band.demography.noDeathAudit;
  if (noDeathAudit?.suspicious === true) {
    events.push({
      category: "demography",
      salience: "medium",
      title: "No-death streak flagged",
      description: noDeathAudit.why,
      detail: `classification ${noDeathAudit.classification}; streak ${noDeathAudit.noDeathStreakYears} years`,
      stateKey: `no-death:${noDeathAudit.classification}:${Math.floor(noDeathAudit.noDeathStreakYears / 10)}`,
      rawSource: "Band.demography.noDeathAudit",
      rawReason: noDeathAudit.classification,
      sourceReasonIds: band.demography.sourceReasonIds,
      repeatWindowTicks: 12,
    });
  }

  return events;
}

function deriveMovementEvents(world: WorldState, band: Band): readonly BandReadableEventCandidate[] {
  const move = (band.recentResidentialMoveEvents ?? [])
    .filter((event) => Number(world.time.tick) - Number(event.tick) <= 2)
    .sort((left, right) => Number(right.tick) - Number(left.tick))[0];

  if (move === undefined) {
    return [];
  }

  const events: BandReadableEventCandidate[] = [{
    category: "movement",
    salience: salienceForMove(move),
    title: titleForMove(move),
    description: describeMove(move),
    detail: `status ${move.status}; hardship ${move.hardshipLevel ?? "none"}; outcome ${move.hardshipOutcome ?? "accepted"}; reason ${move.hardshipReason ?? move.cause}${move.temporaryWatercraft === undefined ? "" : `; crossing ${move.temporaryWatercraft.result} via ${move.temporaryWatercraft.optionLabel ?? "none"}`}`,
    stateKey: `move:${String(move.eventId)}`,
    rawSource: "Band.recentResidentialMoveEvents",
    rawReason: `${move.cause}; ${move.status}; ${move.hardshipReason ?? "no hardship reason"}`,
    sourceReasonIds: move.reasonIds,
    relatedTileId: move.toTileId,
    repeatWindowTicks: 9999,
  }];

  const crossing = move.temporaryWatercraft;
  if (crossing !== undefined) {
    const title =
      crossing.result === "crossing_success" ? "Temporary river crossing succeeded" :
      crossing.result === "crossing_delayed_materials" ? "River crossing delayed the move" :
      crossing.result === "materials_missing" ? "Crossing lacked materials" :
      crossing.result === "crossing_partial_success" ? "Crossing only partly solved the route" :
      "River crossing rejected";
    const description =
      crossing.result === "crossing_success"
        ? `${crossing.optionLabel ?? "Temporary craft"} carried the whole-band crossing through shuttle work.`
        : crossing.result === "crossing_delayed_materials"
          ? "The band had to delay because material, labor, or carried load made the crossing costly."
          : crossing.result === "materials_missing"
            ? "Known materials did not support even an expedient raft or bundle crossing."
            : crossing.result === "crossing_partial_success"
              ? "A temporary crossing aid helped but did not remove load and dependent burden."
              : "Known river risk outweighed the material basis and route pressure.";
    events.push({
      category: "movement",
      salience: crossing.result === "crossing_success" ? "medium" : "high",
      title,
      description,
      detail: `trace ${crossing.traceType}; type ${crossing.watercraftType ?? "none"}; materials ${crossing.materialBasis.join(" | ") || "none"}; adults ${crossing.adultLabor}; dependents ${crossing.dependents}; elders ${crossing.elders}; carry ${crossing.carryBurden}; safety ${round2(crossing.expectedCrossingSafety)}; river risk ${round2(crossing.riverRisk)}; shuttles ${crossing.shuttleTrips}`,
      stateKey: `river-crossing:${String(move.eventId)}:${crossing.result}:${crossing.watercraftType ?? "none"}`,
      rawSource: "ResidentialMoveEvent.temporaryWatercraft",
      rawReason: crossing.reason,
      sourceReasonIds: crossing.reasonIds.length > 0 ? crossing.reasonIds : move.reasonIds,
      relatedTileId: crossing.targetTileId ?? move.toTileId,
      repeatWindowTicks: 9999,
    });
  }

  return events;
}

function deriveActivityEvents(world: WorldState, band: Band): readonly BandReadableEventCandidate[] {
  return (band.recentIntraSeasonTrips ?? [])
    .filter((trip) => Number(world.time.tick) - Number(trip.tick) <= 2)
    .slice(0, 2)
    .map((trip) => ({
      category: "activity" as const,
      salience: salienceForTrip(trip),
      title: titleForTrip(trip),
      description: describeTrip(trip),
      detail: `expected return ${round2(trip.resourceReturn.estimatedReturnValue)}; outcome ${trip.activityOutcome}; memory ${trip.activityMemoryEffect.effectSummary}`,
      stateKey: `trip:${String(trip.sourceBandId)}:${Number(trip.day)}:${trip.taskGroupType}:${String(trip.targetTileId)}`,
      rawSource: "Band.recentIntraSeasonTrips",
      rawReason: `${trip.cause}; ${trip.activityOutcome}; ${trip.activityOutcomeSummary}`,
      sourceReasonIds: trip.reasonIds,
      relatedTileId: trip.targetTileId,
      repeatWindowTicks: 9999,
    }));
}

function deriveWeakBandEvents(band: Band): readonly BandReadableEventCandidate[] {
  const viability = band.viability;
  if (viability === undefined || viability.weakBandFate === undefined || viability.weakBandFate === "viable") {
    return [];
  }

  return [{
    category: "weak_band_fate",
    salience: viability.weakBandFate === "absorbed" || viability.weakBandFate === "collapsed" ? "high" : "medium",
    title: titleForWeakBandFate(viability.weakBandFate),
    description: translateWeakBandFate(viability.weakBandFate, viability.weakBandClassification),
    detail: `status ${viability.status}; classification ${viability.weakBandClassification ?? "unclassified"}; target ${viability.supportSeekingTargetBandId ?? "none"}; blocker ${viability.supportSeekingBlockedReason ?? "none"}; conservation ${viability.populationConservationSummary ?? "none"}`,
    stateKey: `weak:${viability.status}:${viability.weakBandFate}:${viability.weakBandClassification ?? "none"}:${viability.supportSeekingTargetBandId ?? viability.supportSeekingBlockedReason ?? "none"}`,
    rawSource: "Band.viability",
    rawReason: viability.reasonIds.join("|"),
    sourceReasonIds: viability.reasonIds,
    relatedBandId: viability.supportSeekingTargetBandId ?? viability.absorbedByBandId,
    repeatWindowTicks: viability.status === "absorbed" || viability.status === "extinct" ? 9999 : 8,
  }];
}

function deriveDeathMemoryEvents(band: Band): readonly BandReadableEventCandidate[] {
  const memory = band.deathMemory;
  if (memory === undefined || memory.deathMemorySeverity < 0.05 || memory.recentDeathCount <= 0) {
    return [];
  }

  return [{
    category: "death_memory",
    salience: memory.deathMemorySeverity >= 0.35 || memory.recentAdultDeaths > 0 || memory.recentDependentDeaths > 0 ? "high" : "medium",
    title: "Death memory raised caution",
    description: describeDeathMemory(memory.deathMemoryCause, memory.recentDependentDeaths, memory.recentAdultDeaths, memory.recentElderDeaths),
    detail: `severity ${round2(memory.deathMemorySeverity)}; caution ${round2(memory.cautionModifier)}; fertility suppression ${round2(memory.fertilitySuppressionFromRecentDeaths)}; avoid pressure ${round2(memory.avoidPlacePressure)}`,
    stateKey: `death-memory:${memory.deathMemoryCause ?? "unknown"}:${memory.recentDeathCount}:${stressBucket(memory.deathMemorySeverity)}`,
    rawSource: "Band.deathMemory",
    rawReason: `recentDeathCount=${memory.recentDeathCount}; cause=${memory.deathMemoryCause ?? "unknown"}`,
    sourceReasonIds: memory.reasonIds,
    relatedTileId: memory.placeTileId,
    repeatWindowTicks: 6,
  }];
}

function deriveInnerFissionEvents(band: Band): readonly BandReadableEventCandidate[] {
  const fission = band.innerFission;
  if (fission === undefined || fission.state === "unified") {
    return [];
  }

  return [{
    category: "inner_fission",
    salience: fission.state === "near_split" || fission.state === "split_delayed" || fission.state === "factional" ? "high" : "medium",
    title: "Internal pressure changed",
    description: translateInnerFissionState(fission.state),
    detail: `pressure ${round2(fission.pressureScore)}; causes ${fission.topCauses.join(" | ") || "none"}; delayed ${fission.splitDelayedReason ?? "no"}`,
    stateKey: `inner:${fission.state}:${fission.topCauses[0] ?? "none"}`,
    rawSource: "Band.innerFission",
    rawReason: `${fission.state}; hooks=${fission.eventHooks.join("|")}`,
    sourceReasonIds: fission.reasonIds,
    repeatWindowTicks: fission.state === "split_resolved" ? 4 : 8,
  }];
}

function deriveSocialTensionEvents(band: Band): readonly BandReadableEventCandidate[] {
  const social = band.socialTension;
  if (
    social === undefined ||
    (
      social.socialTensionPressure < 0.25 &&
      social.protectiveVaguenessCount <= 0 &&
      social.directionBlurredCount <= 0 &&
      social.crowdedKinResourcePressure < 0.25
    )
  ) {
    return [];
  }

  return [{
    category: "social_tension",
    salience: social.socialTensionPressure >= 0.72 || social.cohesion <= 0.05 || social.tolerance <= 0.05 ? "high" : "medium",
    title: "Social tension readable",
    description: translateSocialTension(social),
    detail: `cohesion ${round2(social.cohesion)}; tolerance ${round2(social.tolerance)}; crowded kin/resources ${round2(social.crowdedKinResourcePressure)}; vagueness ${social.protectiveVaguenessCount}; direction blur ${social.directionBlurredCount}`,
    stateKey: `social:${social.cohesionStatus}:${social.toleranceStatus}:${stressBucket(social.socialTensionPressure)}:${social.protectiveVaguenessCount > 0}:${social.directionBlurredCount > 0}`,
    rawSource: "Band.socialTension",
    rawReason: social.eventHooks.join("|"),
    sourceReasonIds: social.reasonIds,
    relatedBandId: social.relationCategories.find((relation) => relation.otherBandId !== undefined)?.otherBandId,
    repeatWindowTicks: 8,
  }];
}

function deriveAccessNormEvents(band: Band): readonly BandReadableEventCandidate[] {
  const access = band.protoAccessMemory;
  if (access === undefined) {
    return [];
  }

  const memories = [
    ...(access.currentPlace === undefined || access.currentPlace.accessState === "none" ? [] : [access.currentPlace]),
    ...access.topPlaces.filter((memory) =>
      memory.tileId !== access.currentPlace?.tileId &&
      (
        memory.accessState === "stranger_watchful" ||
        memory.accessState === "crowded_use" ||
        memory.accessState === "contested_use" ||
        memory.accessState === "sensitive_place" ||
        memory.accessState === "stale_access_memory" ||
        memory.accessState === "expected_return"
      ),
    ),
  ].slice(0, 3);

  return memories.map((memory) => ({
    category: "access_norms",
    salience: salienceForAccessState(memory.accessState),
    title: titleForAccessState(memory.accessState),
    description: translateAccessState(memory.accessState, memory.placeType),
    detail: `type ${memory.placeType}; importance ${round2(memory.accessImportance)}; sensitivity ${round2(memory.placeSensitivity)}; familiar ${round2(memory.familiarUseStrength)}; repeated ${round2(memory.repeatedReturnStrength)}; kin ${round2(memory.kinTolerance)}; familiar tolerance ${round2(memory.familiarTolerance)}; stranger ${round2(memory.strangerCaution)}; shared ${round2(memory.sharedUsePressure)}; crowding ${round2(memory.crowdingResourcePressure)}; avoidance ${round2(memory.rememberedRefusalAvoidance)}; cooperation ${round2(memory.rememberedCooperationTolerance)}; confidence ${round2(memory.confidence)}; stale ${memory.staleYears}y; behavior max ${round2(access.behavior.maxBehaviorHook)}; reasons ${memory.topReasons.join(" | ")}`,
    stateKey: `access:${String(memory.tileId)}:${memory.accessState}:${stressBucket(memory.placeSensitivity)}:${stressBucket(memory.confidence)}`,
    rawSource: "Band.protoAccessMemory",
    rawReason: `state=${memory.accessState}; placeType=${memory.placeType}; tone=${memory.recentEncounterTone}; positives=${memory.positiveReasons.map((reason) => `${reason.family}:${reason.reason}`).join("|")}; negatives=${memory.negativeReasons.map((reason) => `${reason.family}:${reason.reason}`).join("|")}`,
    sourceReasonIds: memory.sourceReasonIds,
    relatedTileId: memory.tileId,
    repeatWindowTicks: memory.accessState === "stale_access_memory" ? 20 : 8,
  }));
}

function deriveLineageEvents(band: Band): readonly BandReadableEventCandidate[] {
  if (band.parentBandId === undefined && band.lineage === undefined) {
    return [];
  }

  return [{
    category: "lineage",
    salience: "low",
    title: "Lineage branch readable",
    description: `This band is a daughter branch of ${String(band.parentBandId ?? band.lineage?.parentBandId)}.`,
    detail: `daughter count ${band.daughterBandIds.length}; relation ${band.lineage?.relation ?? "parent link"}`,
    stateKey: `lineage:${band.parentBandId ?? band.lineage?.parentBandId ?? "none"}`,
    rawSource: "Band.parentBandId + Band.lineage",
    rawReason: band.lineage?.relation ?? "parentBandId present",
    sourceReasonIds: band.lineage?.reasonIds ?? [],
    relatedBandId: band.parentBandId ?? band.lineage?.parentBandId,
    repeatWindowTicks: 9999,
  }];
}

function deriveProtoCampEvents(band: Band): readonly BandReadableEventCandidate[] {
  const memory = band.protoCampMemory;
  if (memory === undefined) {
    return [];
  }

  const places = [
    ...(memory.currentPlace === undefined || memory.currentPlace.campLikeState === "none" ? [] : [memory.currentPlace]),
    ...memory.topPlaces.filter((place) =>
      (place.campLikeState === "abandoned_camp_trace" || place.campLikeState === "stale_remembered_camp") &&
      place.tileId !== memory.currentPlace?.tileId,
    ),
  ].slice(0, 3);

  return places.map((place) => ({
    category: "camp_place",
    salience: salienceForProtoCamp(place.campLikeState),
    title: titleForProtoCamp(place.campLikeState),
    description: translateProtoCampState(place.campLikeState),
    detail: `score ${round2(place.campLikeScore)}; confidence ${round2(place.confidence)}; visits ${place.visitCount}; seasons ${place.seasonsUsed.join(",")}; active ${place.activeStatus}; trend ${place.lifecycleTrend ?? "stable"}; seasonal ${place.seasonalIdentity ?? "general_return_place"}; pressure ${place.usePressureStatus ?? "low"}; storage ${round2(place.storageProcessingScore ?? 0)}; crossing ${round2(place.crossingUseScore ?? 0)}; families ${(place.reasonFamilies ?? []).map((summary) => `${summary.family}:${round2(summary.positiveStrength)}/${round2(summary.negativeStrength)}`).join(" | ") || "none"}; positives ${place.positiveReasons.map((reason) => `${reason.reason} ${round2(reason.strength)}`).join(" | ") || "none"}; negatives ${place.negativeReasons.map((reason) => `${reason.reason} ${round2(reason.strength)}`).join(" | ") || "none"}`,
    stateKey: `camp:${String(place.tileId)}:${place.campLikeState}:${place.activeStatus}:${stressBucket(place.campLikeScore)}`,
    rawSource: place.tileId === memory.currentPlace?.tileId
      ? "Band.protoCampMemory.currentPlace"
      : "Band.protoCampMemory.topPlaces",
    rawReason: `state=${place.campLikeState}; trend=${place.lifecycleTrend ?? "stable"}; score=${round2(place.campLikeScore)}; rawPositive=${place.rawPositiveReasonCount ?? place.positiveReasons.length}; rawNegative=${place.rawNegativeReasonCount ?? place.negativeReasons.length}; displayed=${place.positiveReasons.length + place.negativeReasons.length}; top=${place.topReasons.join("|")}`,
    sourceReasonIds: place.reasonIds,
    relatedTileId: place.tileId,
    repeatWindowTicks: place.campLikeState === "abandoned_camp_trace" ? 9999 : 8,
  }));
}

function deriveResourceEcologyEvents(band: Band): readonly BandReadableEventCandidate[] {
  const ecology = band.resourceEcology;
  if (ecology === undefined) {
    return [];
  }

  const events: BandReadableEventCandidate[] = [];
  const top = ecology.support.topContributingClasses[0];
  if (top !== undefined && top.supportContribution > 0) {
    events.push({
      category: "resource_ecology",
      salience: top.supportShare >= 0.16 ? "medium" : "low",
      title: "Resource support visible",
      description: resourceContributionDescription(top.label, top.broadType),
      detail: `class ${top.classId}; contribution ${round2(top.supportContribution)}; share ${round2(top.supportShare)}; knowledge ${top.knowledgeState}; source ${top.knowledgeSource}; abstract source ${top.abstractSourceClassId ?? "none"}`,
      stateKey: `resource-support:${top.classId}:${stressBucket(top.supportShare)}`,
      rawSource: "Band.resourceEcology.support.topContributingClasses",
      rawReason: `${top.classId}; support=${round2(top.supportContribution)}; knowledge=${top.knowledgeState}; reason=${top.topReason}`,
      sourceReasonIds: ecology.reasonIds,
      repeatWindowTicks: 8,
    });
  }

  const storageCard = ecology.storageSuitabilityCards.find((card) =>
    card.seasonalBufferValue === "high" ||
    card.storageSuitability === "excellent" ||
    card.perishability === "high" ||
    card.crossingMaterialUse !== "none"
  );
  if (storageCard !== undefined) {
    const perishable = storageCard.perishability === "high";
    events.push({
      category: "resource_ecology",
      salience: perishable || storageCard.seasonalBufferValue === "high" ? "medium" : "low",
      title: perishable ? "Keeping burden visible" : "Storage suitability visible",
      description: perishable
        ? `${storageCard.label} is useful now, but spoilage, processing, or carrying limits matter.`
        : `${storageCard.label} has readable keeping, cache, or seasonal-buffer value.`,
      detail: `class ${storageCard.classId}; storage ${storageCard.storageSuitability}; perishability ${storageCard.perishability}; drying ${storageCard.dryingSuitability}; smoking ${storageCard.smokingSuitability}; labor ${storageCard.processingLabor}; carry ${storageCard.carryBurden}; buffer ${storageCard.seasonalBufferValue}; risk ${storageCard.riskIfMishandled}; confidence ${round2(storageCard.storageConfidence)}; anti-omniscience ${storageCard.antiOmniscienceStatus}`,
      stateKey: `storage-suitability:${storageCard.classId}:${storageCard.storageSuitability}:${storageCard.perishability}:${stressBucket(storageCard.storageConfidence)}`,
      rawSource: "Band.resourceEcology.storageSuitabilityCards",
      rawReason: `${storageCard.classId}; reasons=${storageCard.reasons.join("|")}; sources=${storageCard.sourceIds.join("|")}`,
      sourceReasonIds: ecology.reasonIds,
      relatedTileId: storageCard.sourceTileIds[0],
      repeatWindowTicks: 8,
    });
  }

  if (ecology.support.fallbackContribution > 0.2 && band.seasonalSupport?.hungerClassification !== "stable") {
    events.push({
      category: "resource_ecology",
      salience: "medium",
      title: "Fallback foods used",
      description: "The band relied on fallback foods; survival improved, but labor costs rose.",
      detail: `fallback contribution ${round2(ecology.support.fallbackContribution)}; abstract remainder ${round2(ecology.support.abstractRemainder)}; hunger ${band.seasonalSupport?.hungerClassification ?? "unknown"}`,
      stateKey: `resource-fallback:${stressBucket(ecology.support.fallbackContribution)}:${band.seasonalSupport?.hungerClassification ?? "none"}`,
      rawSource: "Band.resourceEcology.support.fallbackContribution + Band.seasonalSupport",
      rawReason: `fallback=${round2(ecology.support.fallbackContribution)}; hunger=${band.seasonalSupport?.hungerClassification ?? "unknown"}`,
      sourceReasonIds: ecology.reasonIds,
      repeatWindowTicks: 8,
    });
  }

  for (const pressure of ecology.support.pressureEffects.slice(0, 2)) {
    if (pressure.pressure < 0.18) {
      continue;
    }
    events.push({
      category: "resource_ecology",
      salience: pressure.pressure >= 0.32 ? "medium" : "low",
      title: "Resource pressure lowered returns",
      description: "Resource pressure is lowering one class of expected return.",
      detail: `class ${pressure.classId}; pressure ${round2(pressure.pressure)}; pressure loss ${round2(pressure.pressureLoss)}; ${pressure.reason}`,
      stateKey: `resource-pressure:${pressure.classId}:${stressBucket(pressure.pressure)}`,
      rawSource: "Band.resourceEcology.support.pressureEffects",
      rawReason: `${pressure.classId}; pressure=${round2(pressure.pressure)}; loss=${round2(pressure.pressureLoss)}`,
      sourceReasonIds: ecology.reasonIds,
      repeatWindowTicks: 8,
    });
  }

  const memory = ecology.knowledge.topMemories.find((entry) =>
    entry.knowledgeState === "reliable" ||
    entry.knowledgeState === "tested" ||
    entry.knowledgeState === "risky" ||
    entry.knowledgeState === "avoided" ||
    entry.knowledgeState === "stale",
  );
  if (memory !== undefined) {
    events.push({
      category: "resource_ecology",
      salience: memory.knowledgeState === "risky" || memory.knowledgeState === "avoided" ? "medium" : "low",
      title: titleForResourceKnowledge(memory.knowledgeState),
      description: descriptionForResourceKnowledge(memory.knowledgeState, memory.label),
      detail: `class ${memory.resourceClassId}; confidence ${round2(memory.confidence)}; source ${memory.source}; successes ${memory.successCount}; failures ${memory.failureCount}; note ${memory.riskOrAvoidanceNote ?? "none"}`,
      stateKey: `resource-knowledge:${memory.resourceClassId}:${memory.knowledgeState}:${String(memory.placeTileId)}`,
      rawSource: "Band.resourceEcology.knowledge.topMemories",
      rawReason: `${memory.resourceClassId}; state=${memory.knowledgeState}; confidence=${round2(memory.confidence)}; raw=${memory.rawPatchId}`,
      sourceReasonIds: ecology.reasonIds,
      relatedTileId: memory.placeTileId,
      repeatWindowTicks: 12,
    });
  }

  const activity = ecology.activityResourceTraces.find((trace) => trace.outcome !== "no_effect_observed");
  if (activity !== undefined) {
    events.push({
      category: "resource_ecology",
      salience: activity.outcome.includes("failed") || activity.outcome.includes("abandoned") ? "medium" : "low",
      title: activity.outcome.includes("failed") || activity.outcome.includes("abandoned")
        ? "Resource activity failed"
        : "Resource activity confirmed",
      description: activity.outcome.includes("failed") || activity.outcome.includes("abandoned")
        ? "A resource activity failed and can weaken confidence in this place."
        : `${activity.label} activity refreshed resource memory.`,
      detail: `activity ${activity.activityType}; class ${activity.resourceClassId}; outcome ${activity.outcome}; expected contribution ${round2(activity.expectedContribution)}; update ${activity.knowledgeUpdate}`,
      stateKey: `resource-activity:${activity.resourceClassId}:${activity.outcome}:${String(activity.targetTileId)}`,
      rawSource: activity.rawSource,
      rawReason: `${activity.resourceClassId}; outcome=${activity.outcome}; memory=${activity.memoryUpdate}`,
      sourceReasonIds: ecology.reasonIds,
      relatedTileId: activity.targetTileId,
      repeatWindowTicks: 8,
    });
  }

  const campResourcePlace = ecology.topResourcePlaceMemories.find((place) => place.protoCampReasonLinks.length > 0);
  if (campResourcePlace !== undefined) {
    events.push({
      category: "resource_ecology",
      salience: "medium",
      title: "Camp-like place has resource reason",
      description: `${campResourcePlace.label} helps explain why this place matters.`,
      detail: `tile ${String(campResourcePlace.tileId)}; class ${campResourcePlace.resourceClassId}; support ${round2(campResourcePlace.contributionToSupport)}; links ${campResourcePlace.protoCampReasonLinks.join(" | ")}`,
      stateKey: `resource-camp:${campResourcePlace.resourceClassId}:${String(campResourcePlace.tileId)}`,
      rawSource: "Band.resourceEcology.topResourcePlaceMemories + Band.protoCampMemory",
      rawReason: `${campResourcePlace.resourceClassId}; proto=${campResourcePlace.protoCampReasonLinks.join("|")}`,
      sourceReasonIds: ecology.reasonIds,
      relatedTileId: campResourcePlace.tileId,
      repeatWindowTicks: 12,
    });
  }

  return events.slice(0, 6);
}

function deriveVisibleNatureEvents(world: WorldState, band: Band): readonly BandReadableEventCandidate[] {
  const nature = band.visibleNature;
  if (nature === undefined) {
    return [];
  }

  const events: BandReadableEventCandidate[] = [];
  const aquatic = nature.aquaticCards.find((card) =>
    card.aquaticEffect === "overfished" ||
    card.aquaticEffect === "fish_pulse" ||
    card.aquaticEffect === "wetland_buffer" ||
    card.aquaticEffect === "winter_buffer" ||
    card.aquaticEffect === "poor_water_food",
  ) ?? nature.aquaticCards[0];
  if (aquatic !== undefined) {
    const aquaticTitle =
      aquatic.aquaticEffect === "overfished" ? "Aquatic returns under pressure" :
      aquatic.aquaticEffect === "fish_pulse" ? "Seasonal fish pulse" :
      aquatic.aquaticEffect === "wetland_buffer" ? "Wetland food buffered the band" :
      aquatic.aquaticEffect === "winter_buffer" ? "Known fish buffered the lean season" :
      aquatic.aquaticEffect === "poor_water_food" ? "Water present, aquatic food weak" :
      aquatic.aquaticEffect === "recovery" ? "Aquatic place recovering" :
      "Aquatic food place remembered";
    events.push({
      category: "nature",
      salience: aquatic.aquaticEffect === "overfished" || aquatic.aquaticEffect === "poor_water_food" ? "medium" : "low",
      title: aquaticTitle,
      description: selectGroundedTemplate(world, band, "aquatic-resource", [
        `${aquatic.label} is readable at a known water edge.`,
        aquatic.aquaticEffect === "overfished"
          ? `${aquatic.label} is useful, but fishing pressure is lowering returns.`
          : `${aquatic.label} helps explain why this water edge matters.`,
        aquatic.aquaticEffect === "fish_pulse"
          ? `A seasonal fish pulse made the familiar water edge more attractive.`
          : aquatic.aquaticEffect === "wetland_buffer" || aquatic.aquaticEffect === "winter_buffer"
            ? `${aquatic.label} can buffer plant scarcity without erasing hardship.`
            : aquatic.aquaticEffect === "poor_water_food"
              ? `The water edge is known, but aquatic food returns look weak.`
              : `The band reads this place as ${aquatic.knowledgeState.replace(/_/g, " ")}.`,
      ]),
      detail: `stock ${aquatic.stockId}; kind ${aquatic.aquaticKind}; context ${aquatic.waterContext}; state ${aquatic.knowledgeState}; effect ${aquatic.aquaticEffect}; availability ${round2(aquatic.seasonalAvailability)}; productivity ${aquatic.abundanceProductivity}; pressure ${round2(aquatic.pressure)}; recovery ${round2(aquatic.recovery)}; reliability ${round2(aquatic.reliability)}; proto ${aquatic.protoCampLink}; reasons ${aquatic.topReasons.join(" | ")}`,
      stateKey: `nature-aquatic:${aquatic.stockId}:${aquatic.aquaticEffect}:${stressBucket(aquatic.pressure)}`,
      rawSource: aquatic.rawSource,
      rawReason: `aquatic=${aquatic.aquaticKind}; context=${aquatic.waterContext}; effect=${aquatic.aquaticEffect}; reasons=${aquatic.topReasons.join("|")}`,
      sourceReasonIds: nature.reasonIds,
      relatedTileId: aquatic.anchorTileId,
      repeatWindowTicks: 10,
    });
  }

  const animal = nature.faunaCards.find((card) =>
    card.knowledgeState === "hunted_successfully" ||
    card.knowledgeState === "failed_to_find" ||
    card.knowledgeState === "stale_route" ||
    card.knowledgeState === "reliable_route" ||
    card.huntingOrFishingPressure >= 0.34 ||
    card.wariness >= 0.34 ||
    card.risk >= 0.55,
  ) ?? nature.faunaCards[0];
  if (animal !== undefined) {
    const animalTitle =
      animal.knowledgeState === "hunted_successfully" ? "Hunt confirmed animal route" :
      animal.knowledgeState === "failed_to_find" ? "Animal route failed to pay off" :
      animal.knowledgeState === "stale_route" ? "Animal route went stale" :
      animal.knowledgeState === "reliable_route" ? "Animal route became reliable" :
      animal.huntingOrFishingPressure >= 0.46 || animal.wariness >= 0.46 ? "Animals became wary" :
      animal.risk >= 0.55 ? "Animal signs raised caution" :
      "Animal signs remembered";
    events.push({
      category: "nature",
      salience: animal.risk >= 0.55 ? "medium" : "low",
      title: animalTitle,
      description: selectGroundedTemplate(world, band, "animal-sign", [
        `${animal.label} signs are visible near known ground.`,
        `The band has ${animal.knowledgeState.replace(/_/g, " ")} of ${animal.label}.`,
        animal.knowledgeState === "hunted_successfully"
          ? `${animal.label} helped confirm a practical animal route.`
          : animal.knowledgeState === "failed_to_find" || animal.knowledgeState === "stale_route"
            ? `${animal.label} signs became less reliable after failed searching.`
            : animal.huntingOrFishingPressure >= 0.46 || animal.wariness >= 0.46
              ? `Repeated activity made ${animal.label} more wary.`
              : animal.routeReliability >= 0.5
                ? `${animal.label} signs are becoming a reliable route memory.`
                : `${animal.label} tracks are part of the band-known landscape.`,
        animal.risk >= 0.55
          ? `${animal.label} signs made nearby work feel riskier.`
          : `${animal.usefulness.replace(/_/g, " ")} animal knowledge stayed practical, not symbolic.`,
      ]),
      detail: `archetype ${animal.archetype}; knowledge ${animal.knowledgeState}; knownness ${animal.knownness}; usefulness ${animal.usefulness}; confidence ${round2(animal.confidence)}; reliability ${round2(animal.routeReliability)}; pressure ${round2(animal.huntingOrFishingPressure)}; wariness ${round2(animal.wariness)}; danger ${round2(animal.risk)}; habitat ${animal.habitat}; habitat basis ${animal.habitatReason}; evidence ${animal.recentEvidence.join(" | ")}; tags ${animal.tags.join(",")}`,
      stateKey: `nature-animal:${animal.stockId}:${animal.knowledgeState}:${stressBucket(animal.risk + animal.huntingOrFishingPressure + animal.wariness)}`,
      rawSource: animal.rawSource,
      rawReason: `stock=${animal.stockId}; archetype=${animal.archetype}; knownness=${animal.knownness}; usefulness=${animal.usefulness}; habitat=${animal.habitat}; reasons=${animal.topReasons.join("|")}; evidence=${animal.recentEvidence.join("|")}`,
      sourceReasonIds: nature.reasonIds,
      relatedTileId: animal.anchorTileId,
      repeatWindowTicks: 10,
    });
  }

  const plant = nature.plantCards.find((card) => card.useStatus === "overused" || card.topReasons.some((reason) => reason.includes("pulse"))) ?? nature.plantCards[0];
  if (plant !== undefined) {
    const plantTitle =
      plant.plantPatchEffect === "overused" ? "Plant patch overused" :
      plant.plantPatchEffect === "seasonal_pulse" ? "Seasonal plant pulse" :
      plant.plantPatchEffect === "fallback_food" ? "Fallback plant foods watched" :
      plant.plantPatchEffect === "risky_or_avoided" ? "Risky plant patch avoided" :
      plant.plantPatchEffect === "recovering" ? "Plant patch recovering" :
      plant.plantPatchEffect === "lean_scarcity" ? "Lean-season plant scarcity" :
      "Plant patch readable";
    const plantSalience = plant.useStatus === "overused" || plant.useStatus === "avoided" || plant.fallbackRole === "emergency"
      ? "medium"
      : "low";
    events.push({
      category: "nature",
      salience: plantSalience,
      title: plantTitle,
      description: selectGroundedTemplate(world, band, "plant-patch", [
        `${plant.label} is visible in a known place.`,
        plant.useStatus === "overused"
          ? `${plant.label} is known, but pressure is lowering it.`
          : `${plant.label} helps explain nearby plant returns.`,
        plant.plantPatchEffect === "seasonal_pulse"
          ? `${plant.label} is in a seasonal pulse.`
          : plant.plantPatchEffect === "fallback_food"
            ? `${plant.label} is useful as fallback food, but labor cost is ${round2(plant.laborCost)}.`
            : plant.plantPatchEffect === "risky_or_avoided"
              ? `${plant.label} is remembered with a ${plant.risk} risk hook.`
              : plant.plantPatchEffect === "recovering"
                ? `${plant.label} is recovering after pressure or seasonal rest.`
                : plant.plantPatchEffect === "lean_scarcity"
                  ? `${plant.label} is visible, but this season gives low plant returns.`
          : `The band reads this patch as ${plant.knowledgeState.replace(/_/g, " ")}.`,
      ]),
      detail: `patch ${plant.patchId}; class ${plant.plantClassId}; state ${plant.knowledgeState}; use ${plant.useStatus}; effect ${plant.plantPatchEffect}; availability ${plant.seasonalAvailability}; previous ${plant.previousSeasonalAvailability}; trend ${plant.abundanceTrend}; abundance ${round2(plant.abundance)}; pressure ${round2(plant.pressure)}; depletion ${round2(plant.depletion)}; recovery ${round2(plant.recovery)}; fallback ${plant.fallbackRole}; labor ${round2(plant.laborCost)}; reasons ${plant.topReasons.join(" | ")}`,
      stateKey: `nature-plant:${plant.patchId}:${plant.plantPatchEffect}:${stressBucket(plant.pressure)}`,
      rawSource: plant.rawSource,
      rawReason: `plant=${plant.plantClassId}; use=${plant.useStatus}; effect=${plant.plantPatchEffect}; availability=${plant.seasonalAvailability}; trend=${plant.abundanceTrend}; reasons=${plant.topReasons.join("|")}`,
      sourceReasonIds: nature.reasonIds,
      relatedTileId: plant.tileId,
      repeatWindowTicks: 10,
    });
  }

  const forest = nature.forestCards.find((card) =>
    card.visibilityEffect >= 0.48 ||
    card.growthTrend === "recovering" ||
    card.growthTrend === "declining" ||
    card.growthTrend === "dieback" ||
    card.fruitMastLink !== "none" ||
    card.protoCampLink !== "none",
  ) ?? nature.forestCards[0];
  if (forest !== undefined) {
    const forestTitle =
      forest.visibilityEffect >= 0.48 ? "Dense tree cover limits visibility" :
      forest.fruitMastLink !== "none" ? "Tree patch supports fruit or mast" :
      forest.growthTrend === "recovering" ? "Woodland patch recovering" :
      forest.growthTrend === "declining" || forest.growthTrend === "dieback" ? "Tree patch stressed" :
      forest.protoCampLink !== "none" ? "Trees help explain this stopping place" :
      "Forest patch observed";
    const forestSalience = forest.growthTrend === "declining" || forest.growthTrend === "dieback" || forest.visibilityEffect >= 0.58
      ? "medium"
      : "low";
    events.push({
      category: "nature",
      salience: forestSalience,
      title: forestTitle,
      description: selectGroundedTemplate(world, band, "forest-patch", [
        `${forest.label} is visible in known ground.`,
        forest.visibilityEffect >= 0.48
          ? `${forest.label} limits what the band can see.`
          : `${forest.label} helps explain how this place feels and moves.`,
        forest.fruitMastLink !== "none"
          ? `${forest.label} is linked to ${forest.fruitMastLink.replace(/_/g, " ")} resources.`
          : forest.animalHabitatValue >= 0.4
            ? `${forest.label} helps explain animal signs nearby.`
            : forest.growthTrend === "recovering"
              ? `${forest.label} is recovering after pressure or seasonal stress.`
              : forest.growthTrend === "declining" || forest.growthTrend === "dieback"
                ? `${forest.label} is showing stress or dieback.`
                : `The band reads this patch as ${forest.knowledgeState.replace(/_/g, " ")}.`,
      ]),
      detail: `patch ${forest.patchId}; cover ${forest.coverType}; state ${forest.knowledgeState}; seasonal ${forest.seasonalState}; growth ${forest.growthTrend}; density ${round2(forest.density)}; health ${round2(forest.health)}; visibility ${round2(forest.visibilityEffect)}; movement ${round2(forest.movementAccessEffect)}; habitat ${round2(forest.animalHabitatValue)}; fruit/mast ${forest.fruitMastLink}; wood hook ${round2(forest.woodFuelMaterialHook)}; proto ${forest.protoCampLink}; reasons ${forest.topReasons.join(" | ")}`,
      stateKey: `nature-forest:${forest.patchId}:${forest.growthTrend}:${stressBucket(forest.visibilityEffect + forest.pressure)}`,
      rawSource: forest.rawSource,
      rawReason: `forest=${forest.coverType}; growth=${forest.growthTrend}; seasonal=${forest.seasonalState}; perceptions=${forest.perception.join("|")}; reasons=${forest.topReasons.join("|")}`,
      sourceReasonIds: nature.reasonIds,
      relatedTileId: forest.tileId,
      repeatWindowTicks: 10,
    });
  }

  const acute = nature.acuteEpisodes[0];
  if (acute !== undefined) {
    events.push({
      category: "nature",
      salience: acute.outcome === "mortality_recorded_elsewhere" || acute.severity >= 0.72 ? "high" : "medium",
      title: "Acute risk episode",
      description: selectGroundedTemplate(world, band, "acute", [
        `${acute.trigger}; ${acute.mitigation}.`,
        `A short-run ${acute.kind.replace(/_/g, " ")} episode changed caution.`,
        `${acute.durationClass.replace(/_/g, " ")} of risk were grounded in ${acute.cause}.`,
      ]),
      detail: `kind ${acute.kind}; severity ${round2(acute.severity)}; duration ${acute.durationClass}; cohorts ${acute.exposedCohorts.join(",")}; outcome ${acute.outcome}; raw ${acute.rawGrounding}`,
      stateKey: `nature-acute:${acute.kind}:${acute.outcome}:${stressBucket(acute.severity)}`,
      rawSource: "Band.visibleNature.acuteEpisodes",
      rawReason: `${acute.kind}; trigger=${acute.trigger}; cause=${acute.cause}; outcome=${acute.outcome}`,
      sourceReasonIds: acute.reasonIds,
      repeatWindowTicks: 6,
    });
  }

  const trajectory = nature.domesticationTrajectories.find((entry) => entry.stage !== "wild_no_relationship");
  if (trajectory !== undefined) {
    const deferredLimitCount = trajectory.explicitLimits.length;
    events.push({
      category: "nature",
      salience: trajectory.candidate ? "medium" : "low",
      title: "Animal relationship stalled",
      description: selectGroundedTemplate(world, band, "animal-relation", [
        `${trajectory.archetype.replace(/_/g, " ")} are familiar, but not controlled.`,
        `Animal contact is only at ${trajectory.stage.replace(/_/g, " ")}.`,
          `${trajectory.failureReasons[0] ?? "the relationship is shallow"}, so this remains a future hook.`,
      ]),
      detail: `stage ${trajectory.stage}; pathway ${trajectory.pathway}; tolerance ${round2(trajectory.animalTolerance)}; failure ${round2(trajectory.failurePressure)}; deferred practical limits ${deferredLimitCount}`,
      stateKey: `nature-relationship:${trajectory.archetype}:${trajectory.stage}`,
      rawSource: "Band.visibleNature.domesticationTrajectories",
      rawReason: `${trajectory.archetype}; stage=${trajectory.stage}; failures=${trajectory.failureReasons.join("|")}; deferredLimitCount=${deferredLimitCount}`,
      sourceReasonIds: nature.reasonIds,
      repeatWindowTicks: 16,
    });
  }

  return events.slice(0, 5);
}

function deriveAcuteRiskEvents(world: WorldState, band: Band): readonly BandReadableEventCandidate[] {
  const state = band.acuteRisk;
  if (state === undefined) {
    return [];
  }

  return state.recentEpisodes
    .filter((episode) => Number(world.time.tick) - Number(episode.tick) <= 3)
    .slice(0, 2)
    .map((episode) => ({
      category: "nature" as const,
      salience: episode.severity === "critical" || episode.severity === "severe" ? "high" as const : episode.severity === "moderate" ? "medium" as const : "low" as const,
      title: titleForAcuteRisk(episode.kind),
      description: selectGroundedTemplate(world, band, `acute-risk:${episode.kind}`, acuteRiskTemplates(episode)),
      detail: `severity ${episode.severity}; duration ${episode.durationClass}; source ${episode.context.sourceCategory}/${episode.context.sourceLabel}; stress +${round2(episode.effect.extraSeasonalStress)}; activity penalty ${round2(episode.effect.activityEfficiencyPenalty)}; mortality bump ${round2(episode.effect.mortalityRiskBump)}; caution +${round2(episode.effect.movementCautionBump)}; recovery ${episode.remainingRecoverySeasons}; memory ${episode.memoryUpdates.join(" | ") || "none"}`,
      stateKey: `acute-risk:${episode.id}:${episode.remainingRecoverySeasons}`,
      rawSource: "Band.acuteRisk.recentEpisodes",
      rawReason: `${episode.kind}; severity=${episode.severity}; source=${episode.context.sourceCategory}; reasons=${episode.groundedReasons.join("|")}; factors=${episode.contributingFactors.join("|")}`,
      sourceReasonIds: episode.reasonIds,
      relatedTileId: episode.context.sourceTileId,
      repeatWindowTicks: 9999,
    }));
}

function shouldAppendEvent(
  prior: BandEventHistoryState | undefined,
  candidate: BandReadableEventCandidate,
  currentTick: TickNumber,
): boolean {
  if (prior === undefined) {
    return true;
  }

  return ![...prior.recentEvents, ...prior.last25Years].some((event) =>
    event.stateKey === candidate.stateKey &&
    Number(currentTick) - Number(event.tick) <= candidate.repeatWindowTicks
  );
}

function makeReadableEvent(
  world: WorldState,
  band: Band,
  candidate: BandReadableEventCandidate,
): BandReadableEvent {
  return {
    eventId: makeBandEventId(band.id, world.time.tick, candidate.category, candidate.stateKey),
    bandId: band.id,
    tick: world.time.tick,
    year: world.time.year,
    season: world.time.season,
    category: candidate.category,
    salience: candidate.salience,
    title: candidate.title,
    description: candidate.description,
    detail: candidate.detail,
    stateKey: candidate.stateKey,
    rawSource: candidate.rawSource,
    rawReason: candidate.rawReason,
    sourceReasonIds: candidate.sourceReasonIds.slice(-8),
    relatedBandId: candidate.relatedBandId,
    relatedTileId: candidate.relatedTileId,
    grounded: true,
  };
}

function updateLifetimeSummary(
  prior: BandEventLifetimeSummary | undefined,
  appended: readonly BandReadableEvent[],
): BandEventLifetimeSummary {
  return {
    totalEvents: (prior?.totalEvents ?? 0) + appended.length,
    byCategory: updateCountSummary(prior?.byCategory ?? [], appended.map((event) => event.category)),
    bySalience: updateCountSummary(prior?.bySalience ?? [], appended.map((event) => event.salience)),
  };
}

function updateCountSummary(
  prior: readonly BandEventCountSummary[],
  keys: readonly string[],
): readonly BandEventCountSummary[] {
  const counts = new Map<string, number>();
  for (const entry of prior) {
    counts.set(entry.key, entry.count);
  }
  for (const key of keys) {
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([key, count]) => ({ key, count }));
}

function uniqueEvents(events: readonly BandReadableEvent[]): readonly BandReadableEvent[] {
  const seen = new Set<string>();
  const unique: BandReadableEvent[] = [];
  for (const event of events) {
    const key = String(event.eventId);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(event);
  }

  return unique;
}

function collectEventReasonIds(
  appended: readonly BandReadableEvent[],
  prior: readonly ReasonId[],
): readonly ReasonId[] {
  return uniqueStrings([
    ...appended.flatMap((event) => event.sourceReasonIds.map(String)),
    ...prior.map(String),
  ]).slice(0, 16).map((value) => value as ReasonId);
}

function collectProfileReasonIds(band: Band): readonly ReasonId[] {
  return uniqueStrings([
    ...(band.seasonalSupport?.reasonIds ?? []).map(String),
    ...(band.viability?.reasonIds ?? []).map(String),
    ...(band.innerFission?.reasonIds ?? []).map(String),
    ...(band.socialTension?.reasonIds ?? []).map(String),
    ...(band.deathMemory?.reasonIds ?? []).map(String),
    ...(band.acuteRisk?.recentEpisodes.flatMap((episode) => episode.reasonIds) ?? []).map(String),
  ]).slice(0, 16).map((value) => value as ReasonId);
}

function buildLineagePath(world: WorldState, band: Band): readonly BandId[] {
  const upward: BandId[] = [band.id];
  const seen = new Set<string>([String(band.id)]);
  let current = band;

  for (let depth = 0; depth < 12; depth += 1) {
    const parentId = current.parentBandId ?? current.lineage?.parentBandId;
    if (parentId === undefined || seen.has(String(parentId))) {
      break;
    }

    upward.push(parentId);
    seen.add(String(parentId));
    const parent = world.bands[parentId];
    if (parent === undefined) {
      break;
    }
    current = parent;
  }

  return upward.reverse();
}

function findLineageRelationCategory(band: Band): SocialRelationCategory {
  const grounded = band.socialTension?.relationCategories.find((relation) =>
    relation.otherBandId !== undefined &&
    (relation.otherBandId === band.parentBandId || relation.category === "close_kin" || relation.category === "distant_kin")
  );

  return grounded?.category ?? "close_kin";
}

function buildConditionSummary(
  band: Band,
  survivalCondition: string,
  internalCondition: string,
  weakBandCondition: string,
  socialCondition: string,
  campCondition: string | undefined,
): string {
  if (band.viability?.status === "absorbed") {
    return "The group has ended its independent history by joining a grounded known band.";
  }

  if (band.viability?.status === "extinct") {
    return "The band has disappeared as an independent group; the recorded cause is in weak-band fate.";
  }

  if (band.innerFission?.state === "split_delayed" || band.innerFission?.state === "near_split") {
    return `The band is deeply strained. ${survivalCondition} ${internalCondition}`;
  }

  if (campCondition !== undefined) {
    return campCondition;
  }

  if (band.seasonalSupport?.hungerClassification === "seasonal_lean_stress") {
    return "The band is hungry but not collapsing. A lean season has raised caution, while longer support history remains inspectable.";
  }

  if ((band.socialTension?.socialTensionPressure ?? 0) >= 0.55) {
    return `The band's social readout is tense. ${socialCondition}`;
  }

  if (band.viability?.weakBandFate !== undefined && band.viability.weakBandFate !== "viable") {
    return weakBandCondition;
  }

  return survivalCondition;
}

function translateProtoCampState(state: ProtoCampStateKind): string {
  switch (state) {
    case "none":
      return "No camp-like place has formed here.";
    case "repeated_stop":
      return "Repeated use is making this a stopping place.";
    case "seasonal_return_place":
      return "A seasonal return place is forming here.";
    case "refuge_anchor":
      return "The band is clinging to a familiar refuge.";
    case "activity_base":
      return "Repeated nearby work is making this an activity base.";
    case "remnant_holdout":
      return "A weak remnant is holding together near a familiar refuge.";
    case "storage_processing_candidate":
      return "Known resources make this a short-term processing and keeping candidate.";
    case "crossing_camp":
      return "A known crossing or crossing-material place is shaping return memory.";
    case "fragile_camp_like_place":
      return "This camp-like place is useful but worn by pressure, risk, or hardship.";
    case "contested_camp_like_place":
      return "This place is becoming camp-like, but crowding and hunger make it unstable.";
    case "stale_remembered_camp":
      return "The place is remembered, but the knowledge is getting stale.";
    case "persistent_camp_candidate":
      return "Repeated seasonal use is making this a stronger recurring camp candidate.";
    case "proto_camp_candidate":
      return "This place is becoming camp-like through repeated grounded use.";
    case "abandoned_camp_trace":
      return "The group abandoned a camp-like place after repeated hardship or staleness.";
  }
}

function translateAccessState(state: ProtoAccessStateKind, placeType: ProtoAccessPlaceType): string {
  const place = humanizeAccessPlaceType(placeType);
  switch (state) {
    case "none":
      return "No access expectation is readable here.";
    case "familiar_use":
      return `Repeated use makes this ${place} familiar.`;
    case "expected_return":
      return `The band expects to return to this ${place} through remembered use.`;
    case "tolerated_shared_use":
      return `Familiar shared use near this ${place} is tolerated but watched.`;
    case "kin_tolerated":
      return `Kin or close lineage signs near this ${place} are tolerated more easily.`;
    case "stranger_watchful":
      return `Unknown signs near this ${place} make the band watchful.`;
    case "crowded_use":
      return `Shared use around this ${place} is becoming crowded.`;
    case "contested_use":
      return `Repeated shared use around this ${place} is tense and pressured.`;
    case "avoided_shared_use":
      return `Warnings or bad shared-use memory make this ${place} easier to avoid.`;
    case "sensitive_place":
      return `This ${place} is important enough that unknown use feels sensitive.`;
    case "stale_access_memory":
      return `Old access memory around this ${place} is fading.`;
  }
}

function titleForAccessState(state: ProtoAccessStateKind): string {
  switch (state) {
    case "familiar_use":
      return "Familiar use remembered";
    case "expected_return":
      return "Expected return place";
    case "tolerated_shared_use":
      return "Shared use tolerated";
    case "kin_tolerated":
      return "Kin tolerated nearby";
    case "stranger_watchful":
      return "Unknown signs watched";
    case "crowded_use":
      return "Crowded use noticed";
    case "contested_use":
      return "Shared use tense";
    case "avoided_shared_use":
      return "Shared place avoided";
    case "sensitive_place":
      return "Sensitive place";
    case "stale_access_memory":
      return "Access memory stale";
    case "none":
      return "No access expectation";
  }
}

function humanizeAccessPlaceType(placeType: ProtoAccessPlaceType): string {
  switch (placeType) {
    case "water_source":
      return "water place";
    case "ford_crossing":
      return "crossing place";
    case "wetland_fish_place":
      return "wetland or fish place";
    case "plant_patch":
      return "plant patch";
    case "hunting_route":
      return "hunting route";
    case "forest_refuge":
      return "forest refuge";
    case "storage_processing_candidate":
      return "processing place";
    case "persistent_camp":
      return "recurring camp place";
    case "seasonal_return_place":
      return "seasonal return place";
    case "dry_refuge":
      return "dry refuge";
    case "activity_base":
      return "activity base";
  }
}

function titleForAcuteRisk(kind: NonNullable<Band["acuteRisk"]>["recentEpisodes"][number]["kind"]): string {
  switch (kind) {
    case "minor_foraging_injury":
      return "Minor foraging injury";
    case "severe_foraging_injury":
      return "Severe foraging injury";
    case "bad_water_sickness":
      return "Bad-water sickness";
    case "spoiled_or_risky_food_sickness":
      return "Risky food sickness";
    case "plant_poisoning_or_irritation":
      return "Risky plant reaction";
    case "aquatic_accident":
      return "Aquatic accident";
    case "animal_encounter_injury":
      return "Animal encounter injury";
    case "exposure_or_cold_snap":
      return "Exposure hardship";
    case "heat_or_drought_exhaustion":
      return "Drought exhaustion";
    case "travel_accident":
      return "Travel accident";
  }
}

function translateAcuteRiskEpisode(episode: NonNullable<Band["acuteRisk"]>["recentEpisodes"][number]): string {
  const source = episode.context.sourceLabel;
  const lead = episode.confidence < 0.55 ? "A suspected short-run hardship" : "A short-run hardship";
  return `${lead} (${titleForAcuteRisk(episode.kind).toLowerCase()}) is raising caution near ${source}.`;
}

function acuteRiskTemplates(episode: NonNullable<Band["acuteRisk"]>["recentEpisodes"][number]): readonly string[] {
  const label = titleForAcuteRisk(episode.kind).toLowerCase();
  const source = episode.context.sourceLabel;
  const factor = episode.contributingFactors[0] ?? "bounded risk factors";
  const uncertainty = episode.confidence < 0.55 ? "suspected " : "";

  return [
    `${uncertainty}${label} near ${source} increased caution for a short time.`,
    `A ${episode.durationClass.replace(/_/g, " ")} ${label} episode came from ${source}.`,
    `${episode.groundedReasons[0] ?? "A grounded acute-risk trace"} changed stress by ${round2(episode.effect.extraSeasonalStress)} and caution by ${round2(episode.effect.movementCautionBump)}.`,
    `${factor} made ${source} riskier than usual this season.`,
  ];
}

function resourceContributionDescription(label: string, broadType: string): string {
  if (broadType === "plant") {
    return `${label} contributed to current support.`;
  }
  if (broadType === "aquatic") {
    return `${label} helped stabilize current returns.`;
  }
  if (broadType === "animal") {
    return `${label} contributed to foraging returns.`;
  }
  if (broadType === "fallback") {
    return `${label} helped cover lean support.`;
  }
  if (broadType === "water_refuge") {
    return "Known water/refuge conditions helped explain current support.";
  }
  return `${label} is recorded as a future material hook only.`;
}

function titleForResourceKnowledge(state: string): string {
  if (state === "reliable" || state === "tested") {
    return "Resource memory strengthened";
  }
  if (state === "risky" || state === "avoided") {
    return "Resource memory warns against use";
  }
  if (state === "stale") {
    return "Resource memory became stale";
  }
  return "Resource memory updated";
}

function descriptionForResourceKnowledge(state: string, label: string): string {
  if (state === "reliable" || state === "tested") {
    return `${label} memory is becoming more dependable.`;
  }
  if (state === "risky" || state === "avoided") {
    return `${label} is remembered as risky or unreliable.`;
  }
  if (state === "stale") {
    return `${label} memory is stale and less dependable.`;
  }
  return `${label} memory changed.`;
}

function translateHungerClassification(classification: SeasonalHungerClassification): string {
  switch (classification) {
    case "stable":
      return "No meaningful hunger is visible right now.";
    case "seasonal_lean_stress":
      return "A lean season is tightening returns.";
    case "seasonal_water_stress":
      return "Seasonal water stress is raising urgency.";
    case "seasonal_pulse_recovery":
      return "A seasonal pulse briefly improved returns.";
    case "chronic_food_deficit":
      return "Food shortfall has become chronic.";
    case "chronic_water_deficit":
      return "Water stress is chronic.";
    case "chronic_plus_seasonal_stress":
      return "Chronic deficit and seasonal stress are stacked.";
    case "crisis_deficit":
      return "Support deficit has reached crisis level.";
    case "recovery_after_crisis":
      return "The band is recovering, but crisis memory remains.";
  }
}

function translateWeakBandFate(
  fate: NonNullable<Band["viability"]>["weakBandFate"],
  classification: NonNullable<Band["viability"]>["weakBandClassification"],
): string {
  switch (fate) {
    case "viable":
      return "The band remains independently viable.";
    case "stable_remnant":
      return "A small remnant is holding together.";
    case "support_seeking":
      return "The band is looking for known kin support.";
    case "absorption_candidate":
      return "The band is weak enough that grounded absorption is possible.";
    case "absorbed":
      return "The remnant joined a known compatible band.";
    case "collapse_risk":
      return "The band is close to disappearing as an independent group.";
    case "collapsed":
      return classification === "absorbed"
        ? "The band ended as an independent group by absorption."
        : "The band disappeared as an independent group.";
    case undefined:
      return "Weak-band fate has not been evaluated yet.";
  }
}

function translateInnerFissionState(state: NonNullable<Band["innerFission"]>["state"]): string {
  switch (state) {
    case "unified":
      return "The band is holding together.";
    case "strained":
      return "Disagreement is growing.";
    case "divided":
      return "The band is split over what to do.";
    case "factional":
      return "Internal factions are hardening.";
    case "near_split":
      return "A split is becoming likely.";
    case "split_delayed":
      return "A split is desired but unsafe.";
    case "split_resolved":
      return "The pressure to split has eased.";
  }
}

function translateSocialTension(social: NonNullable<Band["socialTension"]>): string {
  if (social.cohesion <= 0.02) {
    return "Internal fracture.";
  }

  if (social.tolerance <= 0.02) {
    return "Open hostility / spiteful silence.";
  }

  if (social.protectiveVaguenessCount > 0 && social.directionBlurredCount > 0 && social.crowdedKinResourcePressure >= 0.25) {
    return "Reports are suspiciously vague under crowding pressure.";
  }

  if (social.crowdedKinResourcePressure >= 0.35) {
    return "Related bands are crowding the same food and water.";
  }

  return `${social.cohesionStatus}; ${social.toleranceStatus}.`;
}

function describeChurnDeaths(churn: DemographicChurnState): string {
  if (churn.dependentDeathsThisYear > 0) {
    return "The weakest dependents were hit hardest by crisis.";
  }

  if (churn.adultDeathsThisYear > 0) {
    return "The crisis is now damaging the working core.";
  }

  if (churn.elderDeathsThisYear > 0) {
    return "Older members are dying, reducing the band's margin.";
  }

  if (churn.waterStressDeathsThisYear > 0) {
    return "Water stress caused deaths.";
  }

  if (churn.starvationDeathsThisYear > 0) {
    return "Sustained food deficit caused deaths.";
  }

  return `${churn.deathsThisYear} death${churn.deathsThisYear === 1 ? "" : "s"} recorded this year.`;
}

function describeDeathMemory(
  cause: DeathCauseKind | undefined,
  dependentDeaths: number,
  adultDeaths: number,
  elderDeaths: number,
): string {
  if (dependentDeaths > 0) {
    return "Dependent deaths are increasing caution and suppressing fertility.";
  }

  if (adultDeaths > 0) {
    return "Adult deaths are damaging labor confidence.";
  }

  if (elderDeaths > 0) {
    return "Elder deaths are increasing caution.";
  }

  return `Recent deaths are increasing caution${cause === undefined ? "" : ` (${cause})`}.`;
}

function formatDeathCauseCounts(churn: DemographicChurnState): string {
  return [
    `elder=${churn.elderDeathsThisYear}`,
    `dependent=${churn.dependentDeathsThisYear}`,
    `adult=${churn.adultDeathsThisYear}`,
    `crisis=${churn.crisisDeathsThisYear}`,
    `water=${churn.waterStressDeathsThisYear}`,
    `food=${churn.starvationDeathsThisYear}`,
    `migration=${churn.migrationHardshipDeathsThisYear}`,
  ].join(";");
}

function titleForHunger(classification: SeasonalHungerClassification): string {
  switch (classification) {
    case "seasonal_pulse_recovery":
    case "recovery_after_crisis":
      return "Support recovery";
    case "seasonal_water_stress":
    case "chronic_water_deficit":
      return "Water stress";
    case "crisis_deficit":
      return "Support crisis";
    default:
      return "Food stress";
  }
}

function titleForWeakBandFate(fate: NonNullable<Band["viability"]>["weakBandFate"]): string {
  switch (fate) {
    case "support_seeking":
      return "Support seeking";
    case "absorption_candidate":
      return "Absorption possible";
    case "absorbed":
      return "Band absorbed";
    case "collapse_risk":
      return "Collapse risk";
    case "collapsed":
      return "Band disappeared";
    default:
      return "Weak-band state";
  }
}

function titleForMove(move: ResidentialMoveEvent): string {
  if (move.hardshipOutcome === "rejected") {
    return "Route rejected";
  }
  if (move.hardshipOutcome === "delayed") {
    return "Move delayed";
  }
  if (move.hardshipOutcome === "diverted") {
    return "Move diverted";
  }
  return move.hardshipLevel === "high" || move.hardshipLevel === "severe"
    ? "Hard migration"
    : "Residential move";
}

function describeMove(move: ResidentialMoveEvent): string {
  if (move.hardshipOutcome === "rejected" && move.hardshipReason?.includes("water") === true) {
    return "A dry crossing was judged too dangerous.";
  }

  if (move.hardshipOutcome === "delayed") {
    return "The move was delayed by load, stress, or route hardship.";
  }

  if (move.hardshipOutcome === "diverted") {
    return "The move diverted toward a safer known route.";
  }

  return `${describeMoveKind(move.moveKind)} ${describeMoveCause(move.cause)}.`;
}

// READABILITY-UI-ORGANIZATION-1 — the generic move description previously fell
// back to raw enum text ("emergency_water_move for water_stress"). Display-only
// wording; each (kind, cause) pair still yields a distinct sentence.
function describeMoveKind(kind: ResidentialMoveEvent["moveKind"]): string {
  switch (kind) {
    case "residential_relocation":
      return "The whole camp moved";
    case "emergency_water_move":
      return "An emergency move for water was made";
    case "food_pressure_move":
      return "The camp moved toward better food";
    case "crowding_pressure_move":
      return "The camp moved away from crowding";
    case "frontier_probe_residential_shift":
      return "The camp shifted toward new country";
    case "daughter_colonization_move":
      return "A daughter band set out for its own country";
    default:
      return "The camp moved";
  }
}

function describeMoveCause(cause: ResidentialMoveEvent["cause"]): string {
  switch (cause) {
    case "water_stress":
      return "because water was running short";
    case "poor_return":
      return "because the land was giving too little";
    case "local_pressure":
      return "under local pressure";
    case "known_opportunity":
      return "toward a known better place";
    case "fission_daughter":
      return "after the band split";
    case "frontier_intent":
      return "drawn by unfamiliar country";
    default:
      return "for reasons of their own";
  }
}

function titleForTrip(trip: IntraSeasonTripRecord): string {
  if (trip.taskGroupType === "water_group") {
    return "Water check";
  }
  if (trip.taskGroupType === "fishing_group") {
    return "Fishing trip";
  }
  if (trip.taskGroupType === "plant_gathering_group" || trip.taskGroupType === "plant_followup_group") {
    return "Plant gathering";
  }
  if (trip.taskGroupType === "hunting_group") {
    return "Hunting trip";
  }
  return "Activity trip";
}

function titleForProtoCamp(state: ProtoCampStateKind): string {
  switch (state) {
    case "seasonal_return_place":
      return "Seasonal stopping place";
    case "refuge_anchor":
      return "Refuge anchor";
    case "activity_base":
      return "Activity base";
    case "remnant_holdout":
      return "Remnant holdout";
    case "storage_processing_candidate":
      return "Processing camp candidate";
    case "crossing_camp":
      return "Crossing camp remembered";
    case "fragile_camp_like_place":
      return "Camp-like place fragile";
    case "contested_camp_like_place":
      return "Contested camp-like place";
    case "stale_remembered_camp":
      return "Camp memory stale";
    case "persistent_camp_candidate":
      return "Persistent camp candidate";
    case "proto_camp_candidate":
      return "Proto-camp candidate";
    case "abandoned_camp_trace":
      return "Camp-like place abandoned";
    case "repeated_stop":
      return "Repeated stop";
    case "none":
      return "No camp-like place";
  }
}

function describeTrip(trip: IntraSeasonTripRecord): string {
  if (trip.activityOutcome === "failed_due_to_season_mismatch") {
    return "A remembered activity failed because the season did not match.";
  }

  if (trip.activityOutcome === "failed_due_to_water_risk") {
    return "A water check was rejected by remembered water risk.";
  }

  if (trip.activityOutcome === "partial_success") {
    return "A small activity group returned with usable results.";
  }

  return trip.activityOutcomeSummary;
}

function salienceForHunger(classification: SeasonalHungerClassification): BandReadableEventSalience {
  switch (classification) {
    case "crisis_deficit":
    case "chronic_plus_seasonal_stress":
      return "high";
    case "chronic_food_deficit":
    case "chronic_water_deficit":
    case "recovery_after_crisis":
      return "medium";
    default:
      return "low";
  }
}

function salienceForMove(move: ResidentialMoveEvent): BandReadableEventSalience {
  if (move.hardshipLevel === "severe" || move.hardshipOutcome === "rejected") {
    return "high";
  }
  if (move.hardshipLevel === "high" || move.hardshipLevel === "moderate" || move.hardshipOutcome === "delayed" || move.hardshipOutcome === "diverted") {
    return "medium";
  }
  return "low";
}

function salienceForTrip(trip: IntraSeasonTripRecord): BandReadableEventSalience {
  if (trip.activityOutcome.startsWith("failed_due_to") || trip.activityOutcome === "abandoned_due_to_risk") {
    return "medium";
  }
  return "low";
}

function salienceForProtoCamp(state: ProtoCampStateKind): BandReadableEventSalience {
  switch (state) {
    case "contested_camp_like_place":
    case "remnant_holdout":
    case "fragile_camp_like_place":
    case "abandoned_camp_trace":
      return "high";
    case "refuge_anchor":
    case "activity_base":
    case "storage_processing_candidate":
    case "crossing_camp":
    case "persistent_camp_candidate":
    case "proto_camp_candidate":
    case "seasonal_return_place":
      return "medium";
    default:
      return "low";
  }
}

function salienceForAccessState(state: ProtoAccessStateKind): BandReadableEventSalience {
  switch (state) {
    case "contested_use":
    case "avoided_shared_use":
    case "sensitive_place":
      return "high";
    case "stranger_watchful":
    case "crowded_use":
    case "expected_return":
    case "kin_tolerated":
    case "tolerated_shared_use":
      return "medium";
    default:
      return "low";
  }
}

function formatGenerationLabel(depth: number): string {
  if (depth <= 0) {
    return "origin";
  }

  if (depth === 1) {
    return "daughter";
  }

  if (depth === 2) {
    return "granddaughter";
  }

  if (depth === 3) {
    return "great-granddaughter";
  }

  return `great-granddaughter depth ${depth}`;
}

function stressBucket(value: number): string {
  if (value >= 0.75) {
    return "severe";
  }
  if (value >= 0.5) {
    return "high";
  }
  if (value >= 0.25) {
    return "moderate";
  }
  return "low";
}

function humanizeResourceClass(classId: string): string {
  switch (classId) {
    case "generic_plant_food":
      return "plant food";
    case "aquatic_food":
      return "water-edge food";
    case "animal_food":
      return "animal food";
    case "fallback_food":
      return "fallback food";
    case "medicinal_or_toxic":
      return "risky plant";
    case "fiber_material":
      return "fiber material";
    case "fuel_material":
      return "wood or fuel material";
    case "water_resource":
      return "water place";
    default:
      return classId.split("_").join(" ");
  }
}

function humanizeLogistics(value: string): string {
  return value.split("_").join(" ");
}

function selectGroundedTemplate(
  world: WorldState,
  band: Band,
  key: string,
  variants: readonly string[],
): string {
  if (variants.length === 0) {
    return "";
  }
  const index = hashParts(String(band.id), [key, Number(world.time.tick), world.time.season]) % variants.length;
  return variants[index] ?? variants[0] ?? "";
}

function hashParts(seed: string, parts: readonly (string | number)[]): number {
  let hash = 2166136261 ^ hashString(seed);

  for (const part of parts) {
    if (typeof part === "number") {
      hash ^= part | 0;
      hash = Math.imul(hash, 16777619);
    } else {
      for (let index = 0; index < part.length; index += 1) {
        hash ^= part.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
      }
    }
    hash ^= hash >>> 13;
    hash = Math.imul(hash, 2246822519);
  }

  return hash >>> 0;
}

function hashString(value: string): number {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function compareCandidates(left: BandReadableEventCandidate, right: BandReadableEventCandidate): number {
  const salience = salienceRank(right.salience) - salienceRank(left.salience);
  if (salience !== 0) {
    return salience;
  }

  const category = left.category.localeCompare(right.category);
  if (category !== 0) {
    return category;
  }

  return left.stateKey.localeCompare(right.stateKey);
}

function compareEventsNewestFirst(left: BandReadableEvent, right: BandReadableEvent): number {
  const tick = Number(right.tick) - Number(left.tick);
  if (tick !== 0) {
    return tick;
  }

  return String(left.eventId).localeCompare(String(right.eventId));
}

function compareBands(left: Band, right: Band): number {
  return String(left.id).localeCompare(String(right.id));
}

function salienceRank(salience: BandReadableEventSalience): number {
  switch (salience) {
    case "high":
      return 3;
    case "medium":
      return 2;
    case "low":
      return 1;
  }
}

function makeBandEventId(
  bandId: BandId,
  tick: TickNumber,
  category: BandReadableEventCategory,
  stateKey: string,
): EventId {
  return `event:band-readability:${bandId}:${tick}:${category}:${sanitizeEventKey(stateKey)}` as EventId;
}

function sanitizeEventKey(value: string): string {
  return value.replace(/[^a-zA-Z0-9:_-]+/g, "_").slice(0, 120);
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }
    seen.add(value);
    result.push(value);
  }

  return result;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
