import type { BandId, ReasonId, TileId } from "../core/types";
import type { NormalizedIntensity } from "../rules/types";
import type { WorldState } from "../world/types";
import type {
  AbsorptionDetailKind,
  AbsorptionDetailRecord,
  AnimalFamiliarityKind,
  AnimalHumanFamiliarityRecord,
  Band,
  IntraSeasonTripTaskGroupType,
  FailureStoryKind,
  FailureStoryRecord,
  InterBandReputationKind,
  InterBandReputationRecord,
  LocalPlaceCharacterRecord,
  PlaceCharacterKind,
  PracticalSkillKind,
  PracticalSkillRecord,
  PracticalSkillStatus,
  RelationshipMemoryBehavior,
  RelationshipMemoryMode,
  RelationshipMemorySocialEcologyState,
  RouteFamiliarityKind,
  RouteFamiliarityRecord,
  ScavengerCampPatternRecord,
  ScavengerPatternKind,
  SeasonalAggregationRecord,
} from "./types";

const PRACTICE_SKILL_CAP = 8;
const ANIMAL_FAMILIARITY_CAP = 6;
const SCAVENGER_PATTERN_CAP = 4;
const AGGREGATION_CAP = 4;
const FAILURE_STORY_CAP = 5;
const PLACE_CHARACTER_CAP = 5;
const REPUTATION_CAP = 6;
const ABSORPTION_DETAIL_CAP = 3;
const ROUTE_FAMILIARITY_CAP = 5;
const MAX_BEHAVIOR_HOOK = 0.12;

interface PracticeAccumulator {
  readonly skill: PracticalSkillKind;
  practice: number;
  successCount: number;
  failureCount: number;
  confidence: number;
  staleRisk: number;
  basis: string;
  reasonIds: ReasonId[];
}

export function applyRelationshipMemorySocialEcologyContext(world: WorldState): WorldState {
  const bands = Object.values(world.bands)
    .sort(compareBands)
    .reduce<Record<string, Band>>((bandsById, band) => {
      bandsById[String(band.id)] = {
        ...band,
        relationshipMemory: deriveRelationshipMemorySocialEcology(world, band),
      };

      return bandsById;
    }, {});

  return {
    ...world,
    bands: bands as Readonly<Record<BandId, Band>>,
  };
}

export function deriveRelationshipMemorySocialEcology(
  world: WorldState,
  band: Band,
): RelationshipMemorySocialEcologyState {
  const practiceSkills = derivePracticeSkills(world, band);
  const animalFamiliarity = deriveAnimalFamiliarity(world, band);
  const scavengerPatterns = deriveScavengerPatterns(world, band, animalFamiliarity);
  const seasonalAggregations = deriveSeasonalAggregations(world, band);
  const failureStories = deriveFailureStories(world, band);
  const placeCharacters = derivePlaceCharacters(world, band, failureStories);
  const reputations = deriveReputations(world, band);
  const absorptionDetails = deriveAbsorptionDetails(world, band);
  const routeFamiliarity = deriveRouteFamiliarity(world, band, failureStories);
  const behavior = deriveBehavior(
    practiceSkills,
    animalFamiliarity,
    scavengerPatterns,
    seasonalAggregations,
    failureStories,
    placeCharacters,
    reputations,
    routeFamiliarity,
  );
  const mode = deriveMode({
    practiceSkills,
    animalFamiliarity,
    seasonalAggregations,
    failureStories,
    placeCharacters,
    reputations,
    routeFamiliarity,
  });
  const reasonIds = uniqueReasonIds([
    makeRelationshipReasonId(band.id, world.time.tick, "state", band.position),
    ...practiceSkills.flatMap((record) => record.reasonIds),
    ...animalFamiliarity.flatMap((record) => record.reasonIds),
    ...scavengerPatterns.flatMap((record) => record.reasonIds),
    ...seasonalAggregations.flatMap((record) => record.reasonIds),
    ...failureStories.flatMap((record) => record.reasonIds),
    ...placeCharacters.flatMap((record) => record.reasonIds),
    ...reputations.flatMap((record) => record.reasonIds),
    ...absorptionDetails.flatMap((record) => record.reasonIds),
    ...routeFamiliarity.flatMap((record) => record.reasonIds),
  ]).slice(0, 28);
  const capsHeld =
    practiceSkills.length <= PRACTICE_SKILL_CAP &&
    animalFamiliarity.length <= ANIMAL_FAMILIARITY_CAP &&
    scavengerPatterns.length <= SCAVENGER_PATTERN_CAP &&
    seasonalAggregations.length <= AGGREGATION_CAP &&
    failureStories.length <= FAILURE_STORY_CAP &&
    placeCharacters.length <= PLACE_CHARACTER_CAP &&
    reputations.length <= REPUTATION_CAP &&
    absorptionDetails.length <= ABSORPTION_DETAIL_CAP &&
    routeFamiliarity.length <= ROUTE_FAMILIARITY_CAP;

  return {
    bandId: band.id,
    lastUpdatedTick: world.time.tick,
    mode,
    practiceSkills,
    animalFamiliarity,
    scavengerPatterns,
    seasonalAggregations,
    failureStories,
    placeCharacters,
    reputations,
    absorptionDetails,
    routeFamiliarity,
    behavior,
    caps: {
      practiceSkillCap: PRACTICE_SKILL_CAP,
      animalFamiliarityCap: ANIMAL_FAMILIARITY_CAP,
      scavengerPatternCap: SCAVENGER_PATTERN_CAP,
      aggregationCap: AGGREGATION_CAP,
      failureStoryCap: FAILURE_STORY_CAP,
      placeCharacterCap: PLACE_CHARACTER_CAP,
      reputationCap: REPUTATION_CAP,
      absorptionDetailCap: ABSORPTION_DETAIL_CAP,
      routeFamiliarityCap: ROUTE_FAMILIARITY_CAP,
    },
    antiOmniscience: {
      fromBandKnownInputsOnly: true,
      hiddenResourceTruthUsed: false,
      hiddenAnimalTruthUsed: false,
      hiddenBandTruthUsed: false,
      hiddenRouteTruthUsed: false,
    },
    capsHeld,
    noCultureSystem: true,
    noReligionMythLanguage: true,
    noLawPropertyTerritoryWar: true,
    noVillageSedentismAgriculture: true,
    noRoadsBridgesDocks: true,
    noAnimalControl: true,
    noNamedPeopleFamilies: true,
    noTechTree: true,
    reasonIds,
  };
}

function derivePracticeSkills(world: WorldState, band: Band): readonly PracticalSkillRecord[] {
  const accumulators = new Map<PracticalSkillKind, PracticeAccumulator>();
  const trips = band.recentIntraSeasonTrips ?? [];

  for (const trip of trips.slice(0, 18)) {
    const skill = skillForTrip(trip.taskGroupType, trip.resourceClassId);
    const success = isSuccessfulTripResult(trip.activityOutcome);
    const failure = isFailedTripResult(trip.activityOutcome);
    const age = Math.max(0, Number(world.time.tick) - Number(trip.tick));
    addPractice(accumulators, {
      skill,
      practice: clamp01(0.16 + trip.estimatedPeopleCount * 0.012 + trip.activityDaysRepresented * 0.02),
      success: success ? 1 : 0,
      failure: failure ? 1 : 0,
      confidence: confidenceSnapshotValue(trip.activityMemoryEffect.confidenceAfter) ?? trip.resourceReturn.returnConfidence ?? 0.32,
      staleRisk: clamp01(age / 60 + (failure ? 0.12 : 0)),
      basis: `${trip.taskGroupType} ${trip.activityOutcome}`,
      reasonIds: trip.reasonIds,
    });
  }

  for (const learning of band.foragingAdaptation?.learningRecords ?? []) {
    const skill: PracticalSkillKind =
      learning.resourceClassId === "aquatic_food"
        ? "fishing_aquatic"
        : learning.riskStatus === "known_risk" || learning.fallbackStatus === "fallback_only" || learning.fallbackStatus === "emergency"
          ? "fallback_food_handling"
          : "plant_gathering";
    addPractice(accumulators, {
      skill,
      practice: clamp01(learning.confidence * 0.28 + learning.proximityCount * 0.025 + learning.testCount * 0.02),
      success: learning.status === "known_poor" || learning.status === "cautiously_known" ? 1 : 0,
      failure: learning.status === "known_risky" ? 1 : 0,
      confidence: learning.confidence,
      staleRisk: learning.status === "not_known" ? 0.42 : 0.14,
      // Display-only grounding phrase — spell the resource class in plain words
      // (READABILITY-UI-ORGANIZATION-1: no snake_case reaches normal UI).
      basis: `learned by trying ${learning.resourceClassId.replace(/_/g, " ")}`,
      reasonIds: learning.reasonIds,
    });
  }

  for (const fallback of band.foragingAdaptation?.fallbackCandidates ?? []) {
    addPractice(accumulators, {
      skill: "fallback_food_handling",
      practice: clamp01(fallback.expectedUsefulness * 0.22 + fallback.confidence * 0.18),
      success: fallback.level === "expanded" || fallback.level === "emergency" ? 1 : 0,
      failure: fallback.riskCost >= 0.45 ? 1 : 0,
      confidence: fallback.confidence,
      staleRisk: fallback.level === "none" ? 0.38 : 0.12,
      basis: fallback.reason,
      reasonIds: fallback.reasonIds,
    });
  }

  for (const card of band.resourceEcology?.storageSuitabilityCards ?? []) {
    if (card.protoCampRelevance === "processing_place" || card.storageSuitability === "good" || card.storageSuitability === "excellent") {
      addPractice(accumulators, {
        skill: "storage_processing",
        practice: clamp01(card.storageConfidence * 0.34 + card.immediateUseValue * 0.12),
        success: card.confidenceKind === "repeated_use" || card.confidenceKind === "observed_use" ? 1 : 0,
        failure: card.riskIfMishandled === "high" ? 1 : 0,
        confidence: card.storageConfidence,
        staleRisk: card.confidenceKind === "low_confidence_inference" ? 0.34 : 0.1,
        basis: `${card.label} processing and keeping practice`,
        reasonIds: card.sourceIds.map((sourceId) => sourceId as ReasonId),
      });
    }
    if (card.crossingMaterialUse !== "none") {
      addPractice(accumulators, {
        skill: "river_crossing",
        practice: clamp01(card.storageConfidence * 0.24),
        success: card.crossingMaterialUse === "fiber_lashing" || card.crossingMaterialUse === "reed_bundle" ? 1 : 0,
        failure: 0,
        confidence: card.storageConfidence,
        staleRisk: 0.18,
        basis: `${card.label} supports temporary crossing materials`,
        reasonIds: card.sourceIds.map((sourceId) => sourceId as ReasonId),
      });
    }
  }

  for (const move of band.recentResidentialMoveEvents?.slice(0, 5) ?? []) {
    const crossing = move.temporaryWatercraft;
    addPractice(accumulators, {
      skill: crossing === undefined ? "long_route_movement" : "river_crossing",
      practice: clamp01(0.16 + move.distanceTiles * 0.025 + (crossing?.routeConfidence ?? 0) * 0.16),
      success: move.status === "arrived" ? 1 : 0,
      failure: move.status === "failed_no_route" || crossing?.result === "crossing_abandoned_risk" ? 1 : 0,
      confidence: move.confidence,
      staleRisk: clamp01(Math.max(0, Number(world.time.tick) - Number(move.tick)) / 72 + (move.hardshipRisk ?? 0) * 0.12),
      basis: move.hardshipReason ?? move.cause,
      reasonIds: move.reasonIds,
    });
  }

  for (const task of band.bodyCampLogistics?.seasonalTasks ?? []) {
    const skill: PracticalSkillKind =
      task.category === "repair_materials" ? "camp_maintenance" :
      task.category === "processing_firewood" || task.category === "winter_shelter_fire" ? "camp_maintenance" :
      task.category === "water_wetland_work" ? "fishing_aquatic" :
      task.category === "fallback_scavenging" ? "fallback_food_handling" :
      "scouting_probing";
    addPractice(accumulators, {
      skill,
      practice: task.urgency * 0.18,
      success: 0,
      failure: task.urgency >= 0.62 ? 1 : 0,
      confidence: task.urgency,
      staleRisk: 0.1,
      basis: task.reason,
      reasonIds: task.reasonIds,
    });
  }

  return [...accumulators.values()]
    .map(practiceRecordFromAccumulator)
    .filter((record) => record.practice >= 0.08 || record.status !== "watched")
    .sort(comparePracticeRecords)
    .slice(0, PRACTICE_SKILL_CAP);
}

function deriveAnimalFamiliarity(world: WorldState, band: Band): readonly AnimalHumanFamiliarityRecord[] {
  return (band.animalPatternKnowledge?.records ?? [])
    .filter((record) => record.confidence >= 0.2)
    .map((record) => {
      const management = band.animalManagement?.records.find((entry) => entry.stockId === record.stockId);
      const campFollowing = clamp01(
        (record.patterns.includes("camp_approach") ? 0.34 : 0) +
          (management?.outcome === "brief_proximity" || management?.outcome === "habituation_increased" ? 0.18 : 0),
      );
      const risk = clamp01(record.contradictionCount * 0.12 + (record.patterns.includes("flight_after_pursuit") ? 0.24 : 0) + (management?.stressObserved ?? 0));
      const kind: AnimalFamiliarityKind = campFollowing >= 0.34 ? "camp_nuisance" :
        risk >= 0.55 ? "dangerous_but_known" :
        record.patterns.includes("flight_after_pursuit") ? "wary_of_hunters" :
        record.patterns.includes("seasonal_return") ? "familiar_route" :
        management?.successes !== undefined && management.successes > 0 ? "tolerated_proximity" :
        record.state === "contradicted" ? "unreliable" : "hard_to_catch";
      const humanLearning = clamp01(record.confidence * 0.5 + Math.min(0.3, record.observationCount * 0.05));
      const reasonIds = [
        makeRelationshipReasonId(band.id, world.time.tick, "animal", record.placeTileId),
      ];

      return {
        stockId: record.stockId,
        label: record.faunaKind.replace(/_/g, " "),
        kind,
        confidence: round2(record.confidence),
        humanLearning: round2(humanLearning),
        animalWariness: round2(clamp01(risk + (management?.outcome === "escaped" ? 0.18 : 0))),
        campFollowing: round2(campFollowing),
        usefulness: management?.successes !== undefined && management.successes > 0 ? "locally promising" : "uncertain",
        risk: round2(risk),
        sourceTileIds: [record.placeTileId, ...record.routeTileIds].slice(0, 4),
        basis: `${record.state}/${record.basis}; ${record.patterns.join(",")}; observations ${record.observationCount}; contradictions ${record.contradictionCount}`,
        reasonIds,
        noAnimalControl: true as const,
      };
    })
    .filter((record) =>
      record.humanLearning >= 0.16 ||
      record.animalWariness >= 0.22 ||
      record.campFollowing >= 0.18 ||
      record.risk >= 0.45
    )
    .sort(compareAnimalRecords)
    .slice(0, ANIMAL_FAMILIARITY_CAP);
}

function deriveScavengerPatterns(
  world: WorldState,
  band: Band,
  animals: readonly AnimalHumanFamiliarityRecord[],
): readonly ScavengerCampPatternRecord[] {
  const records: ScavengerCampPatternRecord[] = [];
  const logistics = band.bodyCampLogistics;
  const clean = logistics?.campCleanliness;
  const scavengerAnimal = animals.find((record) => record.campFollowing >= 0.2 || record.kind === "scavenger_risk" || record.kind === "camp_nuisance");

  if (clean !== undefined && clean.scavengerPressure >= 0.18) {
    records.push(makeScavengerRecord({
      band,
      tick: world.time.tick,
      kind: clean.processingWasteLoad >= 0.28 ? "fish_meat_processing" : clean.wetCampLoad >= 0.3 ? "dirty_wet_camp" : "camp_edge_scraps",
      pressure: clamp01(clean.scavengerPressure + clean.pressure * 0.18),
      risk: clamp01(clean.scavengerPressure * 0.52 + (logistics?.sickness.severity ?? 0) * 0.18),
      opportunity: clamp01((logistics?.opportunisticFoodCandidates[0]?.usefulness ?? 0) * 0.42 + clean.scavengerPressure * 0.12),
      basis: `camp cleanliness ${clean.state}; processing ${round2(clean.processingWasteLoad)}; wet ${round2(clean.wetCampLoad)}`,
      reasonIds: clean.reasonIds,
    }));
  }

  if (scavengerAnimal !== undefined) {
    records.push(makeScavengerRecord({
      band,
      tick: world.time.tick,
      kind: scavengerAnimal.kind === "scavenger_risk" ? "predator_signs_near_prey" : "camp_edge_scraps",
      pressure: clamp01(scavengerAnimal.campFollowing + scavengerAnimal.animalWariness * 0.12),
      risk: clamp01(scavengerAnimal.risk * 0.48 + scavengerAnimal.campFollowing * 0.24),
      opportunity: clamp01(scavengerAnimal.campFollowing * 0.1),
      basis: `${scavengerAnimal.label}: ${scavengerAnimal.basis}`,
      reasonIds: scavengerAnimal.reasonIds,
    }));
  }

  if (logistics?.sickness.active === true && logistics.sickness.severity >= 0.28) {
    records.push(makeScavengerRecord({
      band,
      tick: world.time.tick,
      kind: "sickness_weakness",
      pressure: clamp01(logistics.sickness.severity * 0.36 + (clean?.scavengerPressure ?? 0) * 0.32),
      risk: clamp01(logistics.sickness.severity * 0.42),
      opportunity: 0,
      basis: "sickness and care burden make camp-edge signs more worrying",
      reasonIds: logistics.sickness.reasonIds,
    }));
  }

  return records
    .filter((record) => record.pressure >= 0.12)
    .sort(compareScavengerRecords)
    .slice(0, SCAVENGER_PATTERN_CAP);
}

function deriveSeasonalAggregations(world: WorldState, band: Band): readonly SeasonalAggregationRecord[] {
  const records: SeasonalAggregationRecord[] = [];
  const access = band.protoAccessMemory?.currentPlace;
  const camp = band.protoCampMemory?.currentPlace;
  const storage = band.resourceEcology?.storageSuitabilitySummary;
  const aquatic = band.visibleNature?.aquaticCards[0];
  const pressure = band.pressureState?.nearbyBandPressure ?? 0;
  const familiarTolerance = Math.max(access?.kinTolerance ?? 0, access?.familiarTolerance ?? 0);
  const accessTension = Math.max(access?.strangerCaution ?? 0, access?.sharedUsePressure ?? 0);

  if (aquatic !== undefined && aquatic.reliability >= 0.35 && (pressure >= 0.16 || access?.placeType === "wetland_fish_place")) {
    records.push(makeAggregationRecord({
      band,
      tick: world.time.tick,
      tileId: aquatic.anchorTileId,
      trigger: "fish_wetland_pulse",
      intensity: clamp01(aquatic.reliability * 0.45 + pressure * 0.32),
      tolerance: clamp01(familiarTolerance + aquatic.recovery * 0.18),
      tension: clamp01(accessTension + aquatic.pressure * 0.18),
      dispersalSignal: clamp01(aquatic.pressure * 0.34 + (world.time.season === "winter" ? 0.08 : 0)),
      basis: `${aquatic.label}; reliability ${round2(aquatic.reliability)}; shared pressure ${round2(pressure)}`,
      reasonIds: [makeRelationshipReasonId(band.id, world.time.tick, "aggregation", aquatic.anchorTileId), ...(band.visibleNature?.reasonIds.slice(0, 2) ?? [])],
    }));
  }

  if (storage?.bestSeasonalBufferClassId !== undefined && camp !== undefined && camp.storageProcessingScore >= 0.24) {
    records.push(makeAggregationRecord({
      band,
      tick: world.time.tick,
      tileId: camp.tileId,
      trigger: "seed_mast_pulse",
      intensity: clamp01(camp.storageProcessingScore * 0.42 + pressure * 0.18),
      tolerance: clamp01(familiarTolerance + camp.ecologicalRecovery * 0.18),
      tension: clamp01(accessTension + camp.ecologicalPressure * 0.12),
      dispersalSignal: clamp01(camp.ecologicalPressure * 0.3 + (camp.lifecycleTrend === "weakening" ? 0.18 : 0)),
      // Display-only grounding phrase; class id spelled in plain words.
      basis: `${storage.bestSeasonalBufferClassId.replace(/_/g, " ")} and processing place memory`,
      reasonIds: camp.reasonIds,
    }));
  }

  if (camp !== undefined && (camp.campLikeState === "refuge_anchor" || camp.seasonalIdentity === "dry_refuge_return")) {
    records.push(makeAggregationRecord({
      band,
      tick: world.time.tick,
      tileId: camp.tileId,
      trigger: "dry_water_refuge",
      intensity: clamp01(camp.waterRefugeReliability * 0.46 + pressure * 0.24),
      tolerance: clamp01(familiarTolerance + camp.knownKinContactNearby * 0.22),
      tension: clamp01(accessTension + camp.socialCrowdingPressureNearby * 0.18),
      dispersalSignal: clamp01(camp.ecologicalPressure * 0.24 + camp.socialCrowdingPressureNearby * 0.22),
      basis: `${camp.campLikeState}; ${camp.seasonalIdentity}`,
      reasonIds: camp.reasonIds,
    }));
  }

  if (access !== undefined && (access.placeType === "ford_crossing" || access.placeType === "persistent_camp" || access.placeType === "seasonal_return_place") && pressure >= 0.12) {
    records.push(makeAggregationRecord({
      band,
      tick: world.time.tick,
      tileId: access.tileId,
      trigger: access.placeType === "ford_crossing" ? "known_crossing_bottleneck" : "persistent_camp_identity",
      intensity: clamp01(access.placeSensitivity * 0.34 + pressure * 0.28),
      tolerance: clamp01(familiarTolerance),
      tension: clamp01(accessTension),
      dispersalSignal: clamp01(access.crowdingResourcePressure * 0.34 + access.staleness * 0.12),
      basis: `${access.placeType}; ${access.accessState}`,
      reasonIds: access.sourceReasonIds,
    }));
  }

  return records
    .filter((record) => record.intensity >= 0.14)
    .sort(compareAggregationRecords)
    .slice(0, AGGREGATION_CAP);
}

function deriveFailureStories(world: WorldState, band: Band): readonly FailureStoryRecord[] {
  const records: FailureStoryRecord[] = [];

  for (const memory of band.bodyCampLogistics?.weatherMemories ?? []) {
    if (memory.strength < 0.22) {
      continue;
    }
    const kind: FailureStoryKind =
      memory.kind === "bad_crossing_season" ? "bad_crossing" :
      memory.kind === "cold_exposure" || memory.kind === "wet_travel" ? "cold_route" :
      memory.kind === "dry_water_stress" || memory.kind === "heat_drought" ? "bad_water" :
      "dirty_camp";
    records.push(makeFailureStory({
      band,
      tick: world.time.tick,
      kind,
      tileId: band.position,
      strength: memory.strength,
      staleness: memory.staleness,
      caution: memory.routeCaution,
      trend: memory.trend === "recovered" ? "fading" : memory.trend,
      phrase: kind === "bad_crossing"
        ? "people still mention the hard crossing when this route comes up"
        : kind === "cold_route"
          ? "people remember this as a cold or wet route"
          : "water trouble still makes this place feel costly",
      basis: memory.source,
      reasonIds: memory.sourceReasonIds,
    }));
  }

  for (const failure of band.foragingAdaptation?.tripFailureMemories ?? []) {
    if (failure.failureCount <= 0 && failure.lowReturnCount <= 0) {
      continue;
    }
    records.push(makeFailureStory({
      band,
      tick: world.time.tick,
      kind: failure.taskGroupType === "hunting_group" ? "failed_hunt_route" : "overuse_collapse",
      tileId: failure.tileId,
      strength: clamp01(failure.confidencePenalty + failure.failureCount * 0.08 + failure.lowReturnCount * 0.05),
      staleness: failure.recoveredBySuccess ? 0.54 : 0.14,
      caution: clamp01(failure.confidencePenalty + (failure.action === "abandon_temporarily" ? 0.18 : 0)),
      trend: failure.recoveredBySuccess ? "fading" : failure.action === "abandon_temporarily" ? "reinforced" : "forming",
      phrase: failure.action === "abandon_temporarily"
        ? "people stopped trusting that route for now"
        : "poor returns are becoming a remembered warning",
      basis: `${failure.taskGroupType}; failures ${failure.failureCount}; low returns ${failure.lowReturnCount}; action ${failure.action}`,
      reasonIds: failure.reasonIds,
    }));
  }

  for (const episode of band.acuteRisk?.recentEpisodes ?? []) {
    const kind: FailureStoryKind =
      episode.kind === "plant_poisoning_or_irritation" || episode.kind === "spoiled_or_risky_food_sickness" ? "risky_plant" :
      episode.kind === "bad_water_sickness" ? "bad_water" :
      episode.kind === "animal_encounter_injury" ? "animal_injury" :
      episode.kind === "aquatic_accident" || episode.kind === "travel_accident" ? "bad_crossing" :
      episode.kind === "exposure_or_cold_snap" ? "cold_route" :
      "sickness_camp";
    const age = Math.max(0, Number(world.time.tick) - Number(episode.tick));
    records.push(makeFailureStory({
      band,
      tick: world.time.tick,
      kind,
      tileId: episode.context.sourceTileId,
      strength: clamp01(severityValue(episode.severity) * 0.6 + episode.effect.movementCautionBump * 0.28),
      staleness: clamp01(age / 80),
      caution: clamp01(episode.effect.movementCautionBump + severityValue(episode.severity) * 0.18),
      trend: age > 48 ? "stale" : episode.remainingRecoverySeasons > 0 ? "reinforced" : "forming",
      phrase: `${episode.context.sourceLabel} is remembered as a practical warning`,
      basis: `${episode.kind}; severity ${episode.severity}`,
      reasonIds: episode.reasonIds,
    }));
  }

  const viability = band.viability;
  if (viability?.supportSeekingBlockedReason !== undefined || viability?.weakBandClassification === "failed_support_seeking") {
    records.push(makeFailureStory({
      band,
      tick: world.time.tick,
      kind: "failed_support",
      strength: clamp01((viability.extinctionRisk ?? 0) * 0.36 + 0.24),
      staleness: 0.1,
      caution: clamp01((viability.viabilityPressure ?? 0) * 0.42),
      trend: "forming",
      phrase: "failed support is making future help feel less certain",
      basis: viability.supportSeekingBlockedReason ?? viability.weakBandClassification ?? "weak-band support failure",
      reasonIds: viability.reasonIds,
    }));
  }

  return records
    .filter((record) => record.strength >= 0.18)
    .sort(compareFailureStories)
    .slice(0, FAILURE_STORY_CAP);
}

function derivePlaceCharacters(
  world: WorldState,
  band: Band,
  failures: readonly FailureStoryRecord[],
): readonly LocalPlaceCharacterRecord[] {
  const records: LocalPlaceCharacterRecord[] = [];
  const current = band.protoCampMemory?.currentPlace;
  const access = band.protoAccessMemory?.currentPlace;
  const clean = band.bodyCampLogistics?.campCleanliness;
  const storage = band.resourceEcology?.storageSuitabilityCards[0];
  const aquatic = band.visibleNature?.aquaticCards[0];
  const animal = band.visibleNature?.faunaCards.find((card) => card.risk >= 0.4 || card.routeReliability >= 0.35);
  const forest = band.visibleNature?.forestCards[0];
  const failure = failures[0];

  if (current !== undefined) {
    const kind: PlaceCharacterKind =
      clean !== undefined && clean.pressure >= 0.34 ? "useful_dirty_camp" :
      current.waterRefugeReliability >= 0.5 && (access?.sharedUsePressure ?? 0) >= 0.24 ? "reliable_crowded_water" :
      current.lifecycleTrend === "weakening" || current.usePressureStatus === "overused" ? "worn_familiar_camp" :
      current.seasonalIdentity === "winter_shelter" ? "safe_winter_shelter" :
      current.storageProcessingScore >= 0.32 ? "rich_heavy_carry" :
      "good_but_short_lived";
    records.push(makePlaceCharacter({
      tileId: current.tileId,
      kind,
      salience: clamp01(current.campLikeScore * 0.42 + current.confidence * 0.18 + (clean?.pressure ?? 0) * 0.18),
      confidence: current.confidence,
      pressure: Math.max(current.ecologicalPressure, clean?.pressure ?? 0, access?.sharedUsePressure ?? 0),
      recovery: Math.max(current.ecologicalRecovery, clean?.recovery ?? 0),
      label: labelPlaceCharacter(kind),
      basis: current.topReasons[0] ?? `${current.campLikeState}; ${current.lifecycleTrend}`,
      reasonIds: current.reasonIds,
    }));
  }

  if (aquatic !== undefined && aquatic.reliability >= 0.32) {
    records.push(makePlaceCharacter({
      tileId: aquatic.anchorTileId,
      kind: "generous_wetland",
      salience: clamp01(aquatic.reliability * 0.42 + aquatic.seasonalAvailability * 0.2),
      confidence: aquatic.confidence,
      pressure: aquatic.pressure,
      recovery: aquatic.recovery,
      label: "generous wetland",
      basis: `${aquatic.label}; ${aquatic.aquaticEffect}`,
      reasonIds: [makeRelationshipReasonId(band.id, world.time.tick, "place", aquatic.anchorTileId), ...(band.visibleNature?.reasonIds.slice(0, 2) ?? [])],
    }));
  }

  if (failure !== undefined && failure.tileId !== undefined) {
    records.push(makePlaceCharacter({
      tileId: failure.tileId,
      kind: failure.kind === "bad_crossing" ? "bad_crossing" : failure.kind === "cold_route" ? "cold_route" : "good_but_short_lived",
      salience: failure.strength,
      confidence: clamp01(1 - failure.staleness * 0.5),
      pressure: failure.caution,
      recovery: clamp01(failure.staleness),
      label: failure.kind === "bad_crossing" ? "bad crossing" : failure.kind === "cold_route" ? "cold route" : "practical warning place",
      basis: failure.basis,
      reasonIds: failure.reasonIds,
    }));
  }

  if (storage !== undefined && storage.carryBurden === "high") {
    records.push(makePlaceCharacter({
      tileId: storage.sourceTileIds[0] ?? band.position,
      kind: storage.classId === "reeds_fibers" ? "annoying_reed_bed" : "rich_heavy_carry",
      salience: clamp01(storage.immediateUseValue * 0.3 + storage.storageConfidence * 0.26),
      confidence: storage.storageConfidence,
      pressure: storage.spoilageRisk === "high" ? 0.34 : 0.18,
      recovery: 0.12,
      label: storage.classId === "reeds_fibers" ? "annoying reed bed" : "rich but heavy-carry place",
      basis: storage.reasons[0] ?? storage.label,
      reasonIds: storage.sourceIds.map((sourceId) => sourceId as ReasonId),
    }));
  }

  if (animal !== undefined) {
    records.push(makePlaceCharacter({
      tileId: animal.anchorTileId,
      kind: "risky_animal_trail",
      salience: clamp01(animal.risk * 0.34 + animal.routeReliability * 0.24 + animal.wariness * 0.22),
      confidence: animal.confidence,
      pressure: Math.max(animal.huntingOrFishingPressure, animal.wariness, animal.risk),
      recovery: clamp01(1 - animal.huntingOrFishingPressure),
      label: "risky animal trail",
      basis: `${animal.label}; ${animal.topReasons.join("; ")}`,
      reasonIds: [makeRelationshipReasonId(band.id, world.time.tick, "place-animal", animal.anchorTileId), ...(band.visibleNature?.reasonIds.slice(0, 2) ?? [])],
    }));
  }

  if (forest !== undefined && forest.confidence >= 0.28) {
    records.push(makePlaceCharacter({
      tileId: forest.tileId,
      kind: forest.pressure >= 0.36 ? "hungry_forest_edge" : "safe_winter_shelter",
      salience: clamp01(forest.confidence * 0.28 + forest.shadeRefugeValue * 0.24 + forest.pressure * 0.16),
      confidence: forest.confidence,
      pressure: forest.pressure,
      recovery: forest.recovery,
      label: forest.pressure >= 0.36 ? "hungry forest edge" : "safe winter shelter",
      basis: forest.topReasons[0] ?? forest.label,
      reasonIds: [makeRelationshipReasonId(band.id, world.time.tick, "place-forest", forest.tileId), ...(band.visibleNature?.reasonIds.slice(0, 2) ?? [])],
    }));
  }

  return records
    .filter((record) => record.salience >= 0.14)
    .sort(comparePlaceCharacters)
    .slice(0, PLACE_CHARACTER_CAP);
}

function deriveReputations(world: WorldState, band: Band): readonly InterBandReputationRecord[] {
  return Object.values(band.contactMemories)
    .map((memory) => {
      const age = Math.max(0, Number(world.time.tick) - Number(memory.lastContactAt.tick));
      const staleness = clamp01(age / 96);
      const sharedUse = clamp01(memory.sharedUseCount / 4);
      const kind = classifyReputation(memory, staleness);
      return {
        otherBandId: memory.otherBandId,
        kind,
        familiarity: round2(memory.familiarity),
        trust: round2(memory.trustLikeTolerance),
        tension: round2(memory.tension),
        sharedUse: round2(sharedUse),
        staleness: round2(staleness),
        receiverSpecific: true as const,
        basis: `contacts ${memory.contactCount}; peaceful ${memory.peacefulContactCount}; strained ${memory.strainedContactCount}; shared use ${memory.sharedUseCount}; avoidance ${memory.avoidanceCount}`,
        reasonIds: memory.reasonIds,
        noDiplomacy: true as const,
      };
    })
    .filter((record) => record.familiarity >= 0.12 || record.tension >= 0.12 || record.sharedUse >= 0.12)
    .sort(compareReputations)
    .slice(0, REPUTATION_CAP);
}

function deriveAbsorptionDetails(world: WorldState, band: Band): readonly AbsorptionDetailRecord[] {
  const viability = band.viability;
  if (viability === undefined) {
    return [];
  }

  const details: AbsorptionDetailRecord[] = [];
  if (viability.weakBandFate === "absorbed" || viability.status === "absorbed" || viability.weakBandFate === "absorption_candidate") {
    const relation = viability.supportSeekingTargetBandId === undefined ? undefined : band.contactMemories[viability.supportSeekingTargetBandId]?.relation;
    const kind: AbsorptionDetailKind =
      relation === "parent_daughter" || relation === "siblings" ? "kin_reunion" :
      viability.supportSeekingGrounding?.includes("crossing") === true ? "crossing_camp_support" :
      band.protoCampMemory?.currentPlace?.campLikeState === "refuge_anchor" ? "seasonal_refuge_absorption" :
      band.bodyCampLogistics?.sharingPressure.pressure !== undefined && band.bodyCampLogistics.sharingPressure.pressure >= 0.4 ? "reluctant_support" :
      viability.weakBandClassification === "dependent_heavy" ? "dependent_burden" :
      viability.weakBandClassification === "elder_heavy" ? "elder_care_burden" :
      viability.weakBandClassification === "labor_poor" ? "labor_gain" :
      "desperate_shelter";
    details.push({
      kind,
      targetBandId: viability.supportSeekingTargetBandId,
      absorbedByBandId: viability.absorbedByBandId,
      pressure: round2(clamp01(viability.viabilityPressure + viability.extinctionRisk * 0.24)),
      laborGain: round2(clamp01((viability.populationTransferred ?? 0) / 30 + (viability.weakBandClassification === "labor_poor" ? 0.16 : 0))),
      careBurden: round2(clamp01((band.bodyCampLogistics?.careTravelBurden.dependentCarryBurden ?? 0) * 0.38 + (viability.weakBandClassification === "dependent_heavy" ? 0.28 : 0))),
      sharingStrain: round2(clamp01(band.bodyCampLogistics?.sharingPressure.pressure ?? 0)),
      basis: viability.supportSeekingGrounding ?? viability.lastStressSummary ?? viability.weakBandClassification ?? "weak-band fate record",
      reasonIds: viability.reasonIds,
      aggregateOnly: true,
    });
  }

  return details.slice(0, ABSORPTION_DETAIL_CAP);
}

function deriveRouteFamiliarity(
  world: WorldState,
  band: Band,
  failures: readonly FailureStoryRecord[],
): readonly RouteFamiliarityRecord[] {
  const records: RouteFamiliarityRecord[] = [];

  for (const corridor of Object.values(band.travelCorridors).slice(0, 8)) {
    const failureCount = failures.filter((failure) => failure.tileId === corridor.toTileId || failure.tileId === corridor.fromTileId).length;
    const kind: RouteFamiliarityKind =
      corridor.intentKinds.includes("frontier_probe" as never) ? "worn_path" :
      failureCount > 0 ? "bad_segment_avoided" :
      "remembered_bank";
    records.push({
      fromTileId: corridor.fromTileId,
      toTileId: corridor.toTileId,
      kind,
      confidence: round2(corridor.confidence),
      ease: round2(clamp01(corridor.confidence * 0.28 + Math.min(1, corridor.useCount / 6) * 0.26 - failureCount * 0.08)),
      risk: round2(clamp01(failureCount * 0.22)),
      useCount: corridor.useCount,
      failureCount,
      status: failureCount > 0 ? "rewritten" : corridor.useCount >= 4 ? "familiar" : "improving",
      basis: `corridor use ${corridor.useCount}; intents ${corridor.intentKinds.join(",") || "known route"}`,
      reasonIds: [makeRelationshipReasonId(band.id, world.time.tick, "route", corridor.toTileId)],
      noRoad: true,
    });
  }

  for (const crossing of Object.values(band.crossingMemories).slice(0, 6)) {
    records.push({
      fromTileId: crossing.crossingTileA,
      toTileId: crossing.crossingTileB,
      kind: "known_ford",
      confidence: round2(crossing.successConfidence),
      ease: round2(clamp01(crossing.successConfidence * 0.34 + crossing.seasonalReliability * 0.28 - crossing.riskMemory * 0.18)),
      risk: round2(crossing.riskMemory),
      useCount: crossing.useCount,
      failureCount: crossing.riskMemory >= 0.4 ? 1 : 0,
      status: crossing.riskMemory >= 0.5 ? "strained" : crossing.useCount >= 2 ? "familiar" : "improving",
      basis: `${crossing.crossingClass}; seasonal reliability ${round2(crossing.seasonalReliability)}`,
      reasonIds: crossing.reasonIds,
      noRoad: true,
    });
  }

  for (const move of band.recentResidentialMoveEvents?.slice(0, 6) ?? []) {
    const crossing = move.temporaryWatercraft;
    records.push({
      fromTileId: move.fromTileId,
      toTileId: move.toTileId,
      kind: crossing?.protoCampMemoryHint === "material_crossing_place" ? "lashing_spot" : (move.hardshipRisk ?? 0) >= 0.44 ? "bad_segment_avoided" : "worn_path",
      confidence: round2(move.confidence),
      ease: round2(clamp01(move.confidence * 0.24 + (move.status === "arrived" ? 0.18 : 0) - (move.hardshipRisk ?? 0) * 0.12)),
      risk: round2(move.hardshipRisk ?? 0),
      useCount: 1,
      failureCount: move.status === "failed_no_route" ? 1 : 0,
      status: move.status === "failed_no_route" ? "rewritten" : (move.hardshipRisk ?? 0) >= 0.48 ? "strained" : "improving",
      basis: move.hardshipReason ?? move.cause,
      reasonIds: move.reasonIds,
      noRoad: true,
    });
  }

  return records
    .filter((record) => record.confidence >= 0.12 || record.risk >= 0.18)
    .sort(compareRoutes)
    .slice(0, ROUTE_FAMILIARITY_CAP);
}

function deriveBehavior(
  skills: readonly PracticalSkillRecord[],
  animals: readonly AnimalHumanFamiliarityRecord[],
  scavengers: readonly ScavengerCampPatternRecord[],
  aggregations: readonly SeasonalAggregationRecord[],
  failures: readonly FailureStoryRecord[],
  places: readonly LocalPlaceCharacterRecord[],
  reputations: readonly InterBandReputationRecord[],
  routes: readonly RouteFamiliarityRecord[],
): RelationshipMemoryBehavior {
  const practiceEfficiencyBias = boundedHook(Math.max(0, ...skills.map((record) => record.effect)));
  const animalCautionBias = boundedHook(Math.max(0, ...animals.map((record) => record.risk * 0.1 + record.animalWariness * 0.08)));
  const scavengerRiskBias = boundedHook(Math.max(0, ...scavengers.map((record) => record.risk * 0.12)));
  const aggregationToleranceBias = boundedHook(Math.max(0, ...aggregations.map((record) => Math.max(0, record.tolerance - record.tension) * 0.1)));
  const reputationToleranceBias = boundedHook(Math.max(0, ...reputations.map((record) => Math.max(0, record.trust - record.tension) * 0.09)));
  const failureCautionBias = boundedHook(Math.max(0, ...failures.map((record) => record.caution * (1 - record.staleness * 0.5) * 0.12)));
  const placeCharacterPull = boundedHook(Math.max(0, ...places.map((record) => Math.max(0, record.salience - record.pressure * 0.25) * 0.08)));
  const routeConfidenceBias = boundedHook(Math.max(0, ...routes.map((record) => Math.max(0, record.ease - record.risk * 0.35) * 0.1)));
  const maxBehaviorHook = round2(Math.max(
    practiceEfficiencyBias,
    animalCautionBias,
    scavengerRiskBias,
    aggregationToleranceBias,
    reputationToleranceBias,
    failureCautionBias,
    placeCharacterPull,
    routeConfidenceBias,
  ));

  return {
    practiceEfficiencyBias,
    animalCautionBias,
    scavengerRiskBias,
    aggregationToleranceBias,
    reputationToleranceBias,
    failureCautionBias,
    placeCharacterPull,
    routeConfidenceBias,
    maxBehaviorHook,
    reversible: true,
    noHardLock: true,
  };
}

function deriveMode(input: {
  readonly practiceSkills: readonly PracticalSkillRecord[];
  readonly animalFamiliarity: readonly AnimalHumanFamiliarityRecord[];
  readonly seasonalAggregations: readonly SeasonalAggregationRecord[];
  readonly failureStories: readonly FailureStoryRecord[];
  readonly placeCharacters: readonly LocalPlaceCharacterRecord[];
  readonly reputations: readonly InterBandReputationRecord[];
  readonly routeFamiliarity: readonly RouteFamiliarityRecord[];
}): RelationshipMemoryMode {
  if (input.seasonalAggregations.some((record) => record.intensity >= 0.42)) {
    return "seasonal_gathering";
  }
  if (input.failureStories.some((record) => record.strength >= 0.5 && record.staleness < 0.6)) {
    return "failure_remembered";
  }
  if (input.reputations.some((record) => record.tension >= 0.35 || record.sharedUse >= 0.35)) {
    return "socially_tangled";
  }
  if (input.animalFamiliarity.some((record) => record.animalWariness >= 0.38 || record.campFollowing >= 0.34)) {
    return "watchful_animals";
  }
  if (input.routeFamiliarity.some((record) => record.status === "familiar" && record.ease >= 0.28)) {
    return "route_familiar";
  }
  if (input.practiceSkills.some((record) => record.status === "practiced" || record.status === "reliable")) {
    return "practiced";
  }
  if (input.placeCharacters.length > 0 || input.practiceSkills.length > 0) {
    return "practiced";
  }
  return "quiet";
}

function addPractice(
  accumulators: Map<PracticalSkillKind, PracticeAccumulator>,
  input: {
    readonly skill: PracticalSkillKind;
    readonly practice: number;
    readonly success: number;
    readonly failure: number;
    readonly confidence: number;
    readonly staleRisk: number;
    readonly basis: string;
    readonly reasonIds: readonly ReasonId[];
  },
): void {
  const current = accumulators.get(input.skill);
  if (current === undefined) {
    accumulators.set(input.skill, {
      skill: input.skill,
      practice: clamp01(input.practice),
      successCount: input.success,
      failureCount: input.failure,
      confidence: clamp01(input.confidence),
      staleRisk: clamp01(input.staleRisk),
      basis: input.basis,
      reasonIds: [...input.reasonIds],
    });
    return;
  }

  current.practice = clamp01(current.practice + input.practice * 0.7);
  current.successCount += input.success;
  current.failureCount += input.failure;
  current.confidence = Math.max(current.confidence, clamp01(input.confidence));
  current.staleRisk = Math.min(1, Math.max(current.staleRisk, clamp01(input.staleRisk)));
  if (input.practice > current.practice * 0.4) {
    current.basis = input.basis;
  }
  current.reasonIds = uniqueReasonIds([...current.reasonIds, ...input.reasonIds]).slice(0, 8);
}

function practiceRecordFromAccumulator(accumulator: PracticeAccumulator): PracticalSkillRecord {
  const practice = round2(clamp01(
    accumulator.practice +
      accumulator.successCount * 0.04 -
      accumulator.failureCount * 0.025 -
      accumulator.staleRisk * 0.08,
  ));
  const status = classifyPracticeStatus(practice, accumulator.successCount, accumulator.failureCount, accumulator.staleRisk);
  const effect = status === "strained" || status === "rusty"
    ? round2(clamp01(practice * 0.035))
    : round2(clamp01(practice * 0.085 + accumulator.successCount * 0.006));
  return {
    skill: accumulator.skill,
    status,
    practice,
    confidence: round2(accumulator.confidence),
    successCount: accumulator.successCount,
    failureCount: accumulator.failureCount,
    staleRisk: round2(accumulator.staleRisk),
    effect,
    laborRelief: round2(clamp01(effect * 0.7)),
    riskRelief: round2(clamp01(effect * 0.45)),
    basis: accumulator.basis,
    reasonIds: uniqueReasonIds(accumulator.reasonIds).slice(0, 8),
  };
}

function skillForTrip(
  taskGroupType: IntraSeasonTripTaskGroupType,
  resourceClassId: string | undefined,
): PracticalSkillKind {
  if (taskGroupType === "fishing_group") {
    return "fishing_aquatic";
  }
  if (taskGroupType === "hunting_group") {
    return "hunting_tracking";
  }
  if (taskGroupType === "plant_gathering_group" || taskGroupType === "plant_followup_group") {
    return resourceClassId === "fallback_food" || resourceClassId === "risky_or_medicinal" ? "fallback_food_handling" : "plant_gathering";
  }
  if (taskGroupType === "memory_refresh_group" || taskGroupType === "water_group") {
    return "scouting_probing";
  }
  return "plant_gathering";
}

function classifyPracticeStatus(
  practice: number,
  successCount: number,
  failureCount: number,
  staleRisk: number,
): PracticalSkillStatus {
  if (staleRisk >= 0.62) {
    return "rusty";
  }
  if (failureCount >= Math.max(2, successCount + 1)) {
    return "strained";
  }
  if (practice >= 0.72 && successCount >= 3) {
    return "reliable";
  }
  if (practice >= 0.44) {
    return "practiced";
  }
  if (practice >= 0.18) {
    return "improving";
  }
  return "watched";
}

function classifyAnimalFamiliarity(
  card: NonNullable<Band["visibleNature"]>["faunaCards"][number],
  campFollowing: number,
): AnimalFamiliarityKind {
  if (campFollowing >= 0.34) {
    return card.tags.includes("scavenger") || card.tags.includes("pack_predator") ? "scavenger_risk" : "camp_nuisance";
  }
  if (card.risk >= 0.55) {
    return "dangerous_but_known";
  }
  if (card.wariness >= 0.46 || card.huntingOrFishingPressure >= 0.44) {
    return "wary_of_hunters";
  }
  if (card.routeReliability >= 0.48) {
    return "familiar_route";
  }
  if (card.perception.includes("hard_to_catch") || card.usefulness === "unreliable") {
    return "hard_to_catch";
  }
  if (card.humanTolerance >= 0.42 && card.wariness <= 0.28) {
    return "tolerated_proximity";
  }
  return "unreliable";
}

function classifyReputation(
  memory: Band["contactMemories"][BandId],
  staleness: number,
): InterBandReputationKind {
  if (staleness >= 0.72) {
    return "stale_unknown";
  }
  if (memory.relation === "parent_daughter" || memory.relation === "siblings") {
    return "kin_like";
  }
  if (memory.trustLikeTolerance >= 0.5 && memory.peacefulContactCount >= 2) {
    return "helpful";
  }
  if (memory.sharedUseCount >= 2 && memory.tension < 0.34) {
    return "tolerated_familiar";
  }
  if (memory.strainedContactCount >= 2 || memory.tension >= 0.46) {
    return "takes_too_much";
  }
  if (memory.avoidanceCount >= 1) {
    return "unreliable";
  }
  return "watchful";
}

function makeScavengerRecord(input: {
  readonly band: Band;
  readonly tick: number;
  readonly kind: ScavengerPatternKind;
  readonly pressure: number;
  readonly risk: number;
  readonly opportunity: number;
  readonly basis: string;
  readonly reasonIds: readonly ReasonId[];
}): ScavengerCampPatternRecord {
  return {
    kind: input.kind,
    tileId: input.band.position,
    pressure: round2(input.pressure),
    risk: round2(input.risk),
    opportunity: round2(input.opportunity),
    basis: input.basis,
    reasonIds: uniqueReasonIds([
      makeRelationshipReasonId(input.band.id, input.tick, "scavenger", input.band.position),
      ...input.reasonIds,
    ]).slice(0, 8),
    noDirectAttack: true,
  };
}

function makeAggregationRecord(input: {
  readonly band: Band;
  readonly tick: number;
  readonly tileId: TileId;
  readonly trigger: SeasonalAggregationRecord["trigger"];
  readonly intensity: number;
  readonly tolerance: number;
  readonly tension: number;
  readonly dispersalSignal: number;
  readonly basis: string;
  readonly reasonIds: readonly ReasonId[];
}): SeasonalAggregationRecord {
  return {
    tileId: input.tileId,
    trigger: input.trigger,
    intensity: round2(input.intensity),
    tolerance: round2(input.tolerance),
    tension: round2(input.tension),
    expectedDuration: input.dispersalSignal >= 0.5 ? "brief" : "seasonal",
    dispersalSignal: round2(input.dispersalSignal),
    basis: input.basis,
    reasonIds: uniqueReasonIds([
      makeRelationshipReasonId(input.band.id, input.tick, "aggregation", input.tileId),
      ...input.reasonIds,
    ]).slice(0, 8),
    noSettlement: true,
  };
}

function makeFailureStory(input: {
  readonly band: Band;
  readonly tick: number;
  readonly kind: FailureStoryKind;
  readonly tileId?: TileId;
  readonly strength: number;
  readonly staleness: number;
  readonly trend: FailureStoryRecord["trend"];
  readonly caution: number;
  readonly phrase: string;
  readonly basis: string;
  readonly reasonIds: readonly ReasonId[];
}): FailureStoryRecord {
  return {
    kind: input.kind,
    tileId: input.tileId,
    strength: round2(input.strength),
    staleness: round2(input.staleness),
    trend: input.staleness >= 0.78 ? "stale" : input.trend,
    caution: round2(input.caution),
    phrase: input.phrase,
    basis: input.basis,
    reasonIds: uniqueReasonIds([
      makeRelationshipReasonId(input.band.id, input.tick, "failure", input.tileId ?? input.band.position),
      ...input.reasonIds,
    ]).slice(0, 8),
    noMyth: true,
  };
}

function makePlaceCharacter(input: {
  readonly tileId: TileId;
  readonly kind: PlaceCharacterKind;
  readonly salience: number;
  readonly confidence: number;
  readonly pressure: number;
  readonly recovery: number;
  readonly label: string;
  readonly basis: string;
  readonly reasonIds: readonly ReasonId[];
}): LocalPlaceCharacterRecord {
  return {
    tileId: input.tileId,
    kind: input.kind,
    salience: round2(input.salience),
    confidence: round2(input.confidence),
    pressure: round2(clamp01(input.pressure)),
    recovery: round2(clamp01(input.recovery)),
    label: input.label,
    basis: input.basis,
    reasonIds: uniqueReasonIds(input.reasonIds).slice(0, 8),
    practicalOnly: true,
  };
}

function labelPlaceCharacter(kind: PlaceCharacterKind): string {
  switch (kind) {
    case "reliable_crowded_water":
      return "reliable but crowded water";
    case "useful_dirty_camp":
      return "useful but dirty camp";
    case "worn_familiar_camp":
      return "worn but familiar camp";
    case "safe_winter_shelter":
      return "safe winter shelter";
    case "rich_heavy_carry":
      return "rich but heavy-carry place";
    case "good_but_short_lived":
      return "good place that cannot hold them long";
    default:
      return kind.split("_").join(" ");
  }
}

function confidenceSnapshotValue(
  snapshot: NonNullable<Band["lastIntraSeasonTrip"]>["activityMemoryEffect"]["confidenceAfter"] | undefined,
): number | undefined {
  if (snapshot === undefined) {
    return undefined;
  }
  return Math.max(
    snapshot.presenceConfidence,
    snapshot.yieldConfidence,
    snapshot.safetyConfidence,
    snapshot.seasonConfidence,
    snapshot.accessConfidence,
    snapshot.recoveryConfidence,
  );
}

function isSuccessfulTripResult(result: string): boolean {
  return result === "successful_observation" || result === "target_found" || result === "partial_success" || result === "returned_with_information";
}

function isFailedTripResult(result: string): boolean {
  return result === "target_not_found" || result === "failed_due_to_distance" || result === "failed_due_to_water_risk" || result === "failed_due_to_low_memory_confidence" || result === "failed_due_to_season_mismatch" || result === "abandoned_due_to_risk";
}

function severityValue(severity: string): number {
  if (severity === "critical") {
    return 1;
  }
  if (severity === "severe") {
    return 0.74;
  }
  if (severity === "moderate") {
    return 0.48;
  }
  return 0.24;
}

function boundedHook(value: number): NormalizedIntensity {
  return round2(Math.min(MAX_BEHAVIOR_HOOK, clamp01(value)));
}

function comparePracticeRecords(left: PracticalSkillRecord, right: PracticalSkillRecord): number {
  return right.effect - left.effect || right.practice - left.practice || left.skill.localeCompare(right.skill);
}

function compareAnimalRecords(left: AnimalHumanFamiliarityRecord, right: AnimalHumanFamiliarityRecord): number {
  return Math.max(right.risk, right.campFollowing, right.humanLearning) - Math.max(left.risk, left.campFollowing, left.humanLearning) || left.stockId.localeCompare(right.stockId);
}

function compareScavengerRecords(left: ScavengerCampPatternRecord, right: ScavengerCampPatternRecord): number {
  return right.pressure - left.pressure || right.risk - left.risk || left.kind.localeCompare(right.kind);
}

function compareAggregationRecords(left: SeasonalAggregationRecord, right: SeasonalAggregationRecord): number {
  return right.intensity - left.intensity || right.tension - left.tension || String(left.tileId).localeCompare(String(right.tileId));
}

function compareFailureStories(left: FailureStoryRecord, right: FailureStoryRecord): number {
  return right.strength - left.strength || left.staleness - right.staleness || left.kind.localeCompare(right.kind);
}

function comparePlaceCharacters(left: LocalPlaceCharacterRecord, right: LocalPlaceCharacterRecord): number {
  return right.salience - left.salience || right.confidence - left.confidence || String(left.tileId).localeCompare(String(right.tileId));
}

function compareReputations(left: InterBandReputationRecord, right: InterBandReputationRecord): number {
  return Math.max(right.tension, right.trust, right.sharedUse) - Math.max(left.tension, left.trust, left.sharedUse) || String(left.otherBandId).localeCompare(String(right.otherBandId));
}

function compareRoutes(left: RouteFamiliarityRecord, right: RouteFamiliarityRecord): number {
  return right.ease - left.ease || right.confidence - left.confidence || String(left.toTileId).localeCompare(String(right.toTileId));
}

function compareBands(left: Band, right: Band): number {
  return String(left.id).localeCompare(String(right.id));
}

function makeRelationshipReasonId(
  bandId: BandId,
  tick: number,
  kind: string,
  tileId: TileId,
): ReasonId {
  return `reason:relationship-memory:${String(bandId)}:${Math.floor(tick)}:${kind}:${String(tileId)}` as ReasonId;
}

function uniqueReasonIds(ids: readonly ReasonId[]): readonly ReasonId[] {
  const seen = new Set<string>();
  const result: ReasonId[] = [];
  for (const id of ids) {
    const key = String(id);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(id);
  }
  return result;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (value <= 0) {
    return 0;
  }
  if (value >= 1) {
    return 1;
  }
  return value;
}

function round2(value: number): NormalizedIntensity {
  return Math.round(clamp01(value) * 100) / 100;
}
