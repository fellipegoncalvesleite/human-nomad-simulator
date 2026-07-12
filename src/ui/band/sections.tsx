import { useEffect, useState } from "react";

import { Detail } from "./parts";
import { useSimulationStore } from "../../store";
import { getActivityTripId } from "../../render/canvasRenderer";
import { getTile } from "../../sim/world/generate";
import { getDryMarginRelevanceBasis } from "../../sim/agents/dryMargin";
import { deriveResourceBeliefOpportunity } from "../../sim/agents/resourceKnowledge";
import { deriveProbeDiminishingReturn } from "../../sim/agents/probeMemory";
import { deriveMobilityBehaviorBasis } from "../../sim/agents/mobilityBehaviorBasis";
import { derivePlantPatchesForTile, summarizePlantPatchForDebug } from "../../sim/agents/plantPatches";
import { summarizePlantUseEligibilityCandidates } from "../../sim/agents/plantUseEligibility";
import { deriveCauseStressReadiness } from "../../sim/agents/causeStressReadiness";
import { deriveCauseStressContributionV0 } from "../../sim/agents/causeStressIncrement";
import { deriveBandPatchReturnView } from "../../sim/agents/patchExploitationKnowledge";
import { readSeasonalEcologyHint } from "../../sim/agents/seasonalEcologyReader";
import { classifyMovementContext, deriveFamiliarCountry, deriveInheritedRangeContext } from "../../sim/agents/familiarCountry";
import { deriveSocialRangeRecognition } from "../../sim/agents/socialRangeRecognition";
import { deriveLineageIdentity } from "../../sim/agents/lineageIdentity";
import { deriveFordContext } from "../../sim/agents/fordContext";

// 2K.3D: the cause-attributed nonlethal stress increment is feature-flagged and OFF by
// default in the UI (it is a separately-reported contribution, never wired into movement).
const CAUSE_STRESS_V0_UI_ENABLED = false;
import type {
  Band,
  BandMovementRecord,
  BiomeCompetenceRecord,
  CausalTrace,
  ActivityGroupLaborRecord,
  ActivityMemoryEffectRecord,
  BandReadableEventCategory,
  IntraSeasonTripRecord,
  KnownCrossingMemory,
  LocalUsePressureRecord,
  PlaceMemoryRecord,
  RangeFrictionEvent,
  ReportedKnowledgeSpeculation,
  ResidentialMoveEvent,
  SeasonalEcologyObservation,
  TravelCorridorMemory,
  WordOfMouthReport,
} from "../../sim/agents/types";
import { SEASON_LENGTH_DAYS, type TickNumber } from "../../sim/core/types";
import { getBiomeAdaptationFit } from "../../sim/agents/biomeAdaptation";
import { getRiverCrossingForMovement, getSeasonalRiverCrossingState } from "../../sim/world/hydrography";
import {
  getCrowdingPenalty,
  getDaughterDispersalPressure,
  getNearbyBandPressure,
} from "../../sim/agents/crowding";
import type {
  Action,
  AlternativeConsidered,
  Decision,
  MobilityIntent,
  Reason,
  ScoreBreakdown,
} from "../../sim/rules/types";
import type { Tile } from "../../sim/world/types";
import type { WorldState } from "../../sim/world/types";

const SCORE_FIELDS: readonly {
  readonly key: keyof ScoreBreakdown;
  readonly label: string;
}[] = [
  { key: "foodValue", label: "food" },
  { key: "waterValue", label: "water" },
  { key: "waterRefugeSecurity", label: "water refuge" },
  { key: "dryRefugePull", label: "dry refuge" },
  { key: "aquaticValue", label: "aquatic" },
  { key: "movementCost", label: "move cost" },
  { key: "riskCost", label: "risk" },
  { key: "memoryConfidence", label: "memory" },
  { key: "routeValue", label: "route" },
  { key: "attachmentValue", label: "attachment" },
  { key: "populationPressure", label: "population" },
  { key: "storageValue", label: "storage" },
  { key: "explorationValue", label: "explore" },
  { key: "socialCost", label: "social cost" },
  { key: "expectedFutureValue", label: "future" },
  { key: "intentAlignment", label: "intent align" },
  { key: "movementInertia", label: "inertia" },
  { key: "reversalPenalty", label: "reverse penalty" },
  { key: "frontierProbeValue", label: "frontier" },
  { key: "localSurvivalValue", label: "local survival" },
  { key: "placeAttachment", label: "place attach" },
  { key: "rememberedReliability", label: "remembered good" },
  { key: "rememberedRisk", label: "remembered risk" },
  { key: "familiarCorridor", label: "familiar route" },
  { key: "returnPlacePull", label: "return pull" },
  { key: "foodStress", label: "food stress" },
  { key: "waterStress", label: "water stress" },
  { key: "localUsePressure", label: "use pressure" },
  { key: "mobilityPressure", label: "mobility pressure" },
  { key: "placeAttachmentPull", label: "attach pull" },
  { key: "netMovePressure", label: "net move" },
  { key: "recoveryBenefit", label: "recovery" },
  { key: "depletionPenalty", label: "depletion" },
  { key: "riverCrossingCost", label: "river cost" },
  { key: "riverCrossingRisk", label: "river risk" },
  { key: "riverCorridorValue", label: "river corridor" },
  { key: "knownFordValue", label: "known ford" },
  { key: "blockedCrossingPenalty", label: "blocked crossing" },
  { key: "nearbyBandPressure", label: "nearby bands" },
  { key: "parentCoreOverlap", label: "parent overlap" },
  { key: "daughterDispersalPressure", label: "dispersal" },
  { key: "inheritedFamiliarityPull", label: "familiar pull" },
  { key: "safeFrontierPull", label: "safe frontier" },
  { key: "crowdingPenalty", label: "crowding penalty" },
  { key: "biomeCompetence", label: "biome skill" },
  { key: "biomeMismatchPenalty", label: "biome mismatch" },
  { key: "rangeSaturation", label: "range saturation" },
  { key: "perCapitaReturn", label: "per capita return" },
  { key: "frontierDispersalPressure", label: "frontier dispersal" },
  { key: "knownOpportunityPull", label: "opportunity pull" },
  { key: "explorationBaseline", label: "explore baseline" },
  { key: "crowdingExploreBoost", label: "crowd explore" },
  { key: "saturationExploreBoost", label: "saturation explore" },
  { key: "daughterDispersalExploreBoost", label: "daughter explore" },
  { key: "explorationRiskPenalty", label: "explore risk" },
  { key: "encounterTension", label: "encounter tension" },
  { key: "encounterTolerance", label: "encounter tolerance" },
  { key: "splitRisk", label: "split risk" },
  { key: "scoutValue", label: "scout" },
  { key: "moveValue", label: "move value" },
  { key: "currentMarginalReturn", label: "marginal return" },
  { key: "expectedNextReturn", label: "next return" },
  { key: "lossOfFallbackSecurity", label: "fallback loss" },
  { key: "riverProspectStrength", label: "river prospect" },
  { key: "socialAccessRisk", label: "social access" },
  { key: "logisticalProbeValue", label: "logistical probe" },
];

type BandDetailView = "summary" | "activity" | "history" | "debug";

const BAND_DETAIL_VIEWS: readonly {
  readonly id: BandDetailView;
  readonly label: string;
}[] = [
  { id: "summary", label: "Summary" },
  { id: "activity", label: "Activity" },
  { id: "history", label: "History" },
  { id: "debug", label: "Debug" },
];

type BandEventFilter = "all" | BandReadableEventCategory;

const BAND_EVENT_FILTERS: readonly { readonly key: BandEventFilter; readonly label: string }[] = [
  { key: "all", label: "All" },
  { key: "survival", label: "Survival" },
  { key: "demography", label: "Demography" },
  { key: "movement", label: "Movement" },
  { key: "adaptation", label: "Adaptation" },
  { key: "body_logistics", label: "Logistics" },
  { key: "relationship_memory", label: "Relations" },
  { key: "weak_band_fate", label: "Weak fate" },
  { key: "inner_fission", label: "Internal" },
  { key: "social_tension", label: "Social" },
  { key: "camp_place", label: "Camp/place" },
  { key: "resource_ecology", label: "Resources" },
  { key: "nature", label: "Nature" },
];

export function ForagingAdaptationDetails({ band }: { readonly band: Band }) {
  const adaptation = band.foragingAdaptation;

  if (adaptation === undefined) {
    return <Detail label="foraging adaptation" value="not derived yet" />;
  }

  return (
    <>
      <Detail label="mode" value={`${adaptation.mode} · hunger ${formatNumber(adaptation.hungerSeverity)} · streak ${adaptation.hungerStreak} · recovery ${formatNumber(adaptation.recoverySignal)}`} />
      <Detail
        label="caps"
        value={`learning ${adaptation.learningRecords.length}/${adaptation.learningRecordCap} · fallback ${adaptation.fallbackCandidates.length}/${adaptation.fallbackCandidateCap} · trips ${adaptation.tripFailureMemories.length}/${adaptation.tripFailureCap} · probes ${adaptation.nearbyOpportunityProbes.length}/${adaptation.nearbyProbeCap} · repetition ${adaptation.repetitionAffordances.length}/${adaptation.repetitionAffordanceCap} · candidates ${adaptation.candidateTileCap} · held ${String(adaptation.capsHeld)}`}
      />
      <Detail
        label="behavior hooks"
        value={`risk ${formatNumber(adaptation.behavior.riskToleranceModifier)} · fallback ${formatNumber(adaptation.behavior.fallbackExpansionBias)} · trip rest ${formatNumber(adaptation.behavior.tripAbandonmentBias)} · probe ${formatNumber(adaptation.behavior.nearbyProbeBias)} · debate ${formatNumber(adaptation.behavior.movementDebateBias)} · scarcity tension ${formatNumber(adaptation.behavior.socialScarcityTension)} · max ${formatNumber(adaptation.behavior.maxBehaviorHook)}`}
      />
      <Detail
        label="crisis breakaway"
        value={`active ${String(adaptation.crisisBreakaway.active)} · pressure ${formatNumber(adaptation.crisisBreakaway.pressure)} · below peaceful threshold ${String(adaptation.crisisBreakaway.belowPeacefulFissionThreshold)} · severe ${String(adaptation.crisisBreakaway.severeGroundedPressure)} · labor ${String(adaptation.crisisBreakaway.adultLaborEnough)} · no safe solution ${String(adaptation.crisisBreakaway.noSafeAcceptedSolution)} · destination ${String(adaptation.crisisBreakaway.knownRiskyDestination ?? "none")}`}
      />
      <Detail
        label="anti-omniscience"
        value={`band-known ${String(adaptation.antiOmniscience.fromBandKnownTilesOnly)} · hidden patch ${String(adaptation.antiOmniscience.hiddenPatchTruthUsed)} · hidden band ${String(adaptation.antiOmniscience.hiddenBandTruthUsed)} · unseen remain unknown ${String(adaptation.antiOmniscience.unseenPatchesRemainUnknown)}`}
      />
      <Detail
        label="deferred systems"
        value={`culture ladder ${String(adaptation.noCultureLadder)} · agriculture ${String(adaptation.noAgriculture)} · villages ${String(adaptation.noVillageSedentism)} · storage economy ${String(adaptation.noStorageEconomy)} · war/territory ${String(adaptation.noWarTerritory)}`}
      />
      {adaptation.repetitionAffordances.slice(0, 8).map((item, index) => (
        <Detail
          key={`${item.id}:${index}`}
          label={`repetition ${index + 1}`}
          value={`${item.domain} · ${item.familiarityStatus} · exposure ${item.repeatedExposureCount} · attempts ${item.repeatedAttemptSignal} · feedback ${item.feedbackQuality} · potential ${item.improvementPotential} · risk ${item.deadEndRisk} · learned skill false · automatic improvement false · ${item.summary}`}
        />
      ))}
      {adaptation.learningRecords.slice(0, 6).map((record, index) => (
        <Detail
          key={`${String(record.tileId)}:${record.resourceClassId}:${index}`}
          label={`learning ${index + 1}`}
          value={`${String(record.tileId)} · ${record.resourceClassId} · ${record.status} · prior ${record.knowledgeState} · source ${record.source} · confidence ${formatNumber(record.confidence)} · proximity ${record.proximityCount} · visits ${record.visitCount} · tests ${record.testCount} · gated ${record.gatedReason}`}
        />
      ))}
      {adaptation.fallbackCandidates.slice(0, 6).map((candidate, index) => (
        <Detail
          key={`${String(candidate.tileId)}:${candidate.resourceClassId}:${candidate.level}:${index}`}
          label={`fallback ${index + 1}`}
          value={`${String(candidate.tileId)} · ${candidate.resourceClassId} · ${candidate.level} · usefulness ${formatNumber(candidate.expectedUsefulness)} · labor ${formatNumber(candidate.laborCost)} · risk ${formatNumber(candidate.riskCost)} · quality drag ${formatNumber(candidate.dietQualityPenalty)} · ${candidate.reason}`}
        />
      ))}
      {adaptation.tripFailureMemories.slice(0, 6).map((memory, index) => (
        <Detail
          key={`${String(memory.tileId)}:${memory.taskGroupType}:${index}`}
          label={`trip memory ${index + 1}`}
          value={`${String(memory.tileId)} · ${memory.taskGroupType} · ${memory.action} · trips ${memory.recentTripCount} · failures ${memory.failureCount} · low returns ${memory.lowReturnCount} · successes ${memory.successCount} · mean ${formatNumber(memory.meanReturn)} · distance ${memory.longestDistanceTiles} · penalty ${formatNumber(memory.confidencePenalty)} · rest ${memory.restTicksSuggested}`}
        />
      ))}
      {adaptation.nearbyOpportunityProbes.slice(0, 6).map((probe, index) => (
        <Detail
          key={`${String(probe.tileId)}:${index}`}
          label={`nearby probe ${index + 1}`}
          value={`${String(probe.tileId)} · ${probe.comparison} · distance ${probe.distanceTiles} · readiness ${formatNumber(probe.probeReadiness)} · relative ${formatNumber(probe.relativeOpportunity)} · over-capacity ${formatNumber(probe.currentOverCapacity)} · risk ${formatNumber(probe.riskPenalty)} · confidence ${formatNumber(probe.confidence)}`}
        />
      ))}
    </>
  );
}

export function BodyCampLogisticsDetails({ band }: { readonly band: Band }) {
  const logistics = band.bodyCampLogistics;

  if (logistics === undefined) {
    return <Detail label="body/camp logistics" value="not derived yet" />;
  }

  return (
    <>
      <Detail
        label="mode"
        value={`${logistics.mode} · capacity ${formatNumber(logistics.logisticCapacity.capacity)} · sickness ${formatNumber(logistics.sickness.severity)} · cleanliness ${formatNumber(logistics.campCleanliness.pressure)} · sharing ${formatNumber(logistics.sharingPressure.pressure)}`}
      />
      <Detail
        label="caps"
        value={`weather ${logistics.weatherMemories.length}/${logistics.caps.weatherMemoryCap} · material ${logistics.materialWear.length}/${logistics.caps.materialWearCap} · opportunistic ${logistics.opportunisticFoodCandidates.length}/${logistics.caps.opportunisticFoodCap} · tasks ${logistics.seasonalTasks.length}/${logistics.caps.seasonalTaskCap} · held ${String(logistics.capsHeld)}`}
      />
      <Detail
        label="behavior hooks"
        value={`weather ${formatNumber(logistics.behavior.weatherRouteCautionBias)} · sick ${formatNumber(logistics.behavior.sicknessActivityPenalty)} · care ${formatNumber(logistics.behavior.careTravelBurdenBias)} · carry ${formatNumber(logistics.behavior.carryConstraintBias)} · wear ${formatNumber(logistics.behavior.materialWearPenalty)} · camp waste ${formatNumber(logistics.behavior.campCleanlinessMoveAwayBias)} · sharing ${formatNumber(logistics.behavior.sharingTensionBias)} · fire relief ${formatNumber(logistics.behavior.fireExposureReliefBias)} · opportunistic ${formatNumber(logistics.behavior.opportunisticFoodBias)} · max ${formatNumber(logistics.behavior.maxBehaviorHook)}`}
      />
      <Detail
        label="fire"
        value={`${logistics.fire.status} · need ${formatNumber(logistics.fire.need)} · useful ${formatNumber(logistics.fire.usefulness)} · fuel ${formatNumber(logistics.fire.fuelBasis)} · processing ${formatNumber(logistics.fire.processingValue)} · fuel pressure ${formatNumber(logistics.fire.fuelPressure)} · labor ${formatNumber(logistics.fire.laborCost)} · risk ${formatNumber(logistics.fire.fireRisk)} · no hearth ${String(logistics.fire.noPermanentHearth)}`}
      />
      <Detail
        label="sickness"
        value={`active ${String(logistics.sickness.active)} · duration ${logistics.sickness.durationEstimate} · causes ${logistics.sickness.causeKinds.join(",") || "none"} · activity ${formatNumber(logistics.sickness.activityPenalty)} · care ${formatNumber(logistics.sickness.careBurden)} · mortality bump ${formatNumber(logistics.sickness.mortalityPressureBump)} · bounded ${String(logistics.sickness.bounded)}`}
      />
      <Detail
        label="care / travel burden"
        value={`dependents ${formatNumber(logistics.careTravelBurden.dependentCarryBurden)} · elders ${formatNumber(logistics.careTravelBurden.elderTravelCaution)} · pregnancy/nursing ${formatNumber(logistics.careTravelBurden.pregnancyNursingBurden)} · sick care ${formatNumber(logistics.careTravelBurden.sickCareBurden)} · crossing ${formatNumber(logistics.careTravelBurden.wholeBandCrossingBurden)} · long move ${formatNumber(logistics.careTravelBurden.longMoveBurden)} · adult labor ${formatNumber(logistics.careTravelBurden.adultLaborAvailable)} · aggregate ${String(logistics.careTravelBurden.aggregateOnly)}`}
      />
      <Detail
        label="logistic capacity"
        value={`${logistics.logisticCapacity.state} · ${logistics.logisticCapacity.limitingReason} · spare adult ${formatNumber(logistics.logisticCapacity.spareAdultLabor)} · carrying ${formatNumber(logistics.logisticCapacity.carryingLoad)} · processing ${formatNumber(logistics.logisticCapacity.processingLoad)} · travel ${formatNumber(logistics.logisticCapacity.travelLoad)} · crossing ${formatNumber(logistics.logisticCapacity.crossingLoad)} · care ${formatNumber(logistics.logisticCapacity.careLoad)} · no inventory ${String(logistics.logisticCapacity.noInventorySimulation)}`}
      />
      <Detail
        label="camp cleanliness"
        value={`${logistics.campCleanliness.state} · pressure ${formatNumber(logistics.campCleanliness.pressure)} · repeated ${formatNumber(logistics.campCleanliness.repeatedStayLoad)} · wet ${formatNumber(logistics.campCleanliness.wetCampLoad)} · processing ${formatNumber(logistics.campCleanliness.processingWasteLoad)} · sickness ${formatNumber(logistics.campCleanliness.sicknessLoad)} · scavenger ${formatNumber(logistics.campCleanliness.scavengerPressure)} · recovery ${formatNumber(logistics.campCleanliness.recovery)} · no sanitation ${String(logistics.campCleanliness.noSanitationTech)}`}
      />
      <Detail
        label="sharing pressure"
        value={`${logistics.sharingPressure.state} · pressure ${formatNumber(logistics.sharingPressure.pressure)} · dependency ${formatNumber(logistics.sharingPressure.dependencyLoad)} · low returns ${formatNumber(logistics.sharingPressure.lowReturnLoad)} · care ${formatNumber(logistics.sharingPressure.careLoad)} · access ${formatNumber(logistics.sharingPressure.accessCrowdingLoad)} · relief ${formatNumber(logistics.sharingPressure.recoveryRelief)} · no property ${String(logistics.sharingPressure.noOwnershipProperty)}`}
      />
      <Detail
        label="anti-omniscience"
        value={`known inputs ${String(logistics.antiOmniscience.fromBandKnownInputsOnly)} · hidden resource ${String(logistics.antiOmniscience.hiddenResourceTruthUsed)} · hidden band ${String(logistics.antiOmniscience.hiddenBandTruthUsed)} · hidden weather ${String(logistics.antiOmniscience.hiddenWeatherTruthUsed)}`}
      />
      <Detail
        label="deferred systems"
        value={`culture ${String(logistics.noCultureSystem)} · religion ${String(logistics.noReligionMyth)} · agriculture ${String(logistics.noAgriculture)} · villages ${String(logistics.noVillageSedentism)} · storage economy ${String(logistics.noStorageEconomy)} · property/law/territory/war ${String(logistics.noPropertyLawTerritoryWar)} · named people ${String(logistics.noNamedPeople)}`}
      />
      {logistics.weatherMemories.slice(0, 5).map((memory, index) => (
        <Detail
          key={`${memory.kind}:${index}`}
          label={`weather memory ${index + 1}`}
          value={`${memory.kind} · strength ${formatNumber(memory.strength)} · trend ${memory.trend} · stale ${formatNumber(memory.staleness)} · route ${formatNumber(memory.routeCaution)} · fire ${formatNumber(memory.fireNeed)} · child/elder ${formatNumber(memory.childElderRisk)} · ${memory.source}`}
        />
      ))}
      {logistics.materialWear.slice(0, 7).map((wear, index) => (
        <Detail
          key={`${wear.category}:${index}`}
          label={`material wear ${index + 1}`}
          value={`${wear.category} · ${wear.condition} · wear ${formatNumber(wear.wear)} · recovery ${formatNumber(wear.recovery)} · material ${formatNumber(wear.materialBasis)} · labor ${formatNumber(wear.laborCost)} · ${wear.consequence}`}
        />
      ))}
      {logistics.opportunisticFoodCandidates.slice(0, 5).map((candidate, index) => (
        <Detail
          key={`${candidate.kind}:${index}`}
          label={`opportunistic ${index + 1}`}
          value={`${candidate.kind} · tile ${String(candidate.tileId ?? "none")} · use ${formatNumber(candidate.usefulness)} · risk ${formatNumber(candidate.risk)} · labor ${formatNumber(candidate.laborCost)} · reliability ${formatNumber(candidate.reliability)} · ${candidate.triggeredBy} · no surplus ${String(candidate.notStableSurplus)}`}
        />
      ))}
      {logistics.seasonalTasks.slice(0, 5).map((task, index) => (
        <Detail
          key={`${task.category}:${index}`}
          label={`seasonal task ${index + 1}`}
          value={`${task.category} · urgency ${formatNumber(task.urgency)} · ${task.reason} · source ${task.source}`}
        />
      ))}
    </>
  );
}

export function RelationshipMemoryDetails({ band }: { readonly band: Band }) {
  const memory = band.relationshipMemory;

  if (memory === undefined) {
    return <Detail label="relationship memory" value="not derived yet" />;
  }

  return (
    <>
      <Detail
        label="mode"
        value={`${memory.mode} · max hook ${formatNumber(memory.behavior.maxBehaviorHook)} · reasons ${memory.reasonIds.length}`}
      />
      <Detail
        label="caps"
        value={`practice ${memory.practiceSkills.length}/${memory.caps.practiceSkillCap} · animals ${memory.animalFamiliarity.length}/${memory.caps.animalFamiliarityCap} · scavengers ${memory.scavengerPatterns.length}/${memory.caps.scavengerPatternCap} · gatherings ${memory.seasonalAggregations.length}/${memory.caps.aggregationCap} · failures ${memory.failureStories.length}/${memory.caps.failureStoryCap} · places ${memory.placeCharacters.length}/${memory.caps.placeCharacterCap} · reputation ${memory.reputations.length}/${memory.caps.reputationCap} · absorption ${memory.absorptionDetails.length}/${memory.caps.absorptionDetailCap} · routes ${memory.routeFamiliarity.length}/${memory.caps.routeFamiliarityCap} · held ${String(memory.capsHeld)}`}
      />
      <Detail
        label="behavior hooks"
        value={`practice ${formatNumber(memory.behavior.practiceEfficiencyBias)} · animal caution ${formatNumber(memory.behavior.animalCautionBias)} · scavenger ${formatNumber(memory.behavior.scavengerRiskBias)} · gathering tolerance ${formatNumber(memory.behavior.aggregationToleranceBias)} · reputation ${formatNumber(memory.behavior.reputationToleranceBias)} · failure caution ${formatNumber(memory.behavior.failureCautionBias)} · place pull ${formatNumber(memory.behavior.placeCharacterPull)} · route confidence ${formatNumber(memory.behavior.routeConfidenceBias)} · reversible ${String(memory.behavior.reversible)}`}
      />
      <Detail
        label="anti-omniscience"
        value={`known inputs ${String(memory.antiOmniscience.fromBandKnownInputsOnly)} · hidden resource ${String(memory.antiOmniscience.hiddenResourceTruthUsed)} · hidden animal ${String(memory.antiOmniscience.hiddenAnimalTruthUsed)} · hidden band ${String(memory.antiOmniscience.hiddenBandTruthUsed)} · hidden route ${String(memory.antiOmniscience.hiddenRouteTruthUsed)}`}
      />
      <Detail
        label="deferred systems"
        value={`culture ${String(memory.noCultureSystem)} · religion/language ${String(memory.noReligionMythLanguage)} · law/property/territory/war ${String(memory.noLawPropertyTerritoryWar)} · village/agriculture ${String(memory.noVillageSedentismAgriculture)} · roads/bridges/docks ${String(memory.noRoadsBridgesDocks)} · animal control ${String(memory.noAnimalControl)} · named people ${String(memory.noNamedPeopleFamilies)} · tech tree ${String(memory.noTechTree)}`}
      />
      {memory.practiceSkills.slice(0, 8).map((record, index) => (
        <Detail
          key={`${record.skill}:${index}`}
          label={`practice ${index + 1}`}
          value={`${record.skill} · ${record.status} · practice ${formatNumber(record.practice)} · confidence ${formatNumber(record.confidence)} · success ${record.successCount} · failure ${record.failureCount} · stale ${formatNumber(record.staleRisk)} · effect ${formatNumber(record.effect)} · ${record.basis}`}
        />
      ))}
      {memory.animalFamiliarity.slice(0, 6).map((record, index) => (
        <Detail
          key={`${record.stockId}:${index}`}
          label={`animal relation ${index + 1}`}
          value={`${record.label} · ${record.kind} · learning ${formatNumber(record.humanLearning)} · wariness ${formatNumber(record.animalWariness)} · camp-edge ${formatNumber(record.campFollowing)} · risk ${formatNumber(record.risk)} · no control ${String(record.noAnimalControl)} · ${record.basis}`}
        />
      ))}
      {memory.scavengerPatterns.slice(0, 4).map((record, index) => (
        <Detail
          key={`${record.kind}:${index}`}
          label={`camp-edge pattern ${index + 1}`}
          value={`${record.kind} · tile ${String(record.tileId)} · pressure ${formatNumber(record.pressure)} · risk ${formatNumber(record.risk)} · opportunity ${formatNumber(record.opportunity)} · ${record.basis}`}
        />
      ))}
      {memory.seasonalAggregations.slice(0, 4).map((record, index) => (
        <Detail
          key={`${String(record.tileId)}:${record.trigger}:${index}`}
          label={`seasonal gathering ${index + 1}`}
          value={`${String(record.tileId)} · ${record.trigger} · intensity ${formatNumber(record.intensity)} · tolerance ${formatNumber(record.tolerance)} · tension ${formatNumber(record.tension)} · duration ${record.expectedDuration} · dispersal ${formatNumber(record.dispersalSignal)} · temporary ${String(record.noSettlement)} · ${record.basis}`}
        />
      ))}
      {memory.failureStories.slice(0, 5).map((record, index) => (
        <Detail
          key={`${record.kind}:${index}`}
          label={`failure story ${index + 1}`}
          value={`${record.kind} · tile ${String(record.tileId ?? "none")} · strength ${formatNumber(record.strength)} · stale ${formatNumber(record.staleness)} · trend ${record.trend} · caution ${formatNumber(record.caution)} · ${record.phrase} · ${record.basis}`}
        />
      ))}
      {memory.placeCharacters.slice(0, 5).map((record, index) => (
        <Detail
          key={`${String(record.tileId)}:${record.kind}:${index}`}
          label={`place character ${index + 1}`}
          value={`${String(record.tileId)} · ${record.label} · salience ${formatNumber(record.salience)} · confidence ${formatNumber(record.confidence)} · pressure ${formatNumber(record.pressure)} · recovery ${formatNumber(record.recovery)} · ${record.basis}`}
        />
      ))}
      {memory.reputations.slice(0, 6).map((record, index) => (
        <Detail
          key={`${String(record.otherBandId)}:${index}`}
          label={`reputation ${index + 1}`}
          value={`${String(record.otherBandId)} · ${record.kind} · familiarity ${formatNumber(record.familiarity)} · trust ${formatNumber(record.trust)} · tension ${formatNumber(record.tension)} · shared ${formatNumber(record.sharedUse)} · stale ${formatNumber(record.staleness)} · receiver-specific ${String(record.receiverSpecific)} · ${record.basis}`}
        />
      ))}
      {memory.absorptionDetails.slice(0, 3).map((record, index) => (
        <Detail
          key={`${record.kind}:${index}`}
          label={`absorption detail ${index + 1}`}
          value={`${record.kind} · target ${String(record.targetBandId ?? "none")} · absorbed by ${String(record.absorbedByBandId ?? "none")} · pressure ${formatNumber(record.pressure)} · labor ${formatNumber(record.laborGain)} · care ${formatNumber(record.careBurden)} · sharing ${formatNumber(record.sharingStrain)} · aggregate ${String(record.aggregateOnly)} · ${record.basis}`}
        />
      ))}
      {memory.routeFamiliarity.slice(0, 5).map((record, index) => (
        <Detail
          key={`${String(record.fromTileId)}:${String(record.toTileId)}:${index}`}
          label={`route memory ${index + 1}`}
          value={`${String(record.fromTileId)} to ${String(record.toTileId)} · ${record.kind} · ${record.status} · confidence ${formatNumber(record.confidence)} · ease ${formatNumber(record.ease)} · risk ${formatNumber(record.risk)} · use ${record.useCount} · failures ${record.failureCount} · no road ${String(record.noRoad)} · ${record.basis}`}
        />
      ))}
    </>
  );
}


export function SpawnReasonDetails({ band }: { readonly band: Band }) {
  if (band.initialSpawnReason === undefined) {
    return null;
  }

  return (
    <>
      <div className="tile-detail-heading">Spawn reason</div>
      <Detail label="profile" value={band.initialSpawnReason.profileRole} />
      <Detail label="criteria" value={band.initialSpawnReason.criteria.join(", ")} />
      <Detail
        label="food"
        value={formatNumber(band.initialSpawnReason.scoreBreakdown.foodValue)}
      />
      <Detail
        label="water"
        value={formatNumber(band.initialSpawnReason.scoreBreakdown.waterValue)}
      />
      <Detail
        label="aquatic"
        value={formatNumber(band.initialSpawnReason.scoreBreakdown.aquaticValue)}
      />
      <Detail
        label="move penalty"
        value={formatNumber(band.initialSpawnReason.scoreBreakdown.movementCostPenalty)}
      />
      <Detail
        label="risk penalty"
        value={formatNumber(band.initialSpawnReason.scoreBreakdown.riskPenalty)}
      />
      <Detail
        label="terrain match"
        value={formatNumber(band.initialSpawnReason.scoreBreakdown.terrainMatch)}
      />
      <Detail
        label="profile match"
        value={formatNumber(band.initialSpawnReason.scoreBreakdown.profileMatch)}
      />
      <Detail
        label="final score"
        value={formatNumber(band.initialSpawnReason.scoreBreakdown.finalScore)}
      />
    </>
  );
}

export function CausalPressureDetails({
  band,
  latestDecision,
}: {
  readonly band: Band;
  readonly latestDecision: Decision | undefined;
}) {
  const pressureState = band.pressureState;
  const currentUsePressure = band.usePressure[band.position];
  const pressuredMemories = Object.values(band.placeMemory)
    .filter((memory) => {
      const pressure = band.usePressure[memory.tileId];

      return (
        memory.valences.includes("depleted") ||
        memory.valences.includes("avoid_place") ||
        getCombinedUsePressure(pressure) > 0.34
      );
    })
    .sort((left, right) => {
      const leftPressure = getCombinedUsePressure(band.usePressure[left.tileId]);
      const rightPressure = getCombinedUsePressure(band.usePressure[right.tileId]);

      return rightPressure === leftPressure
        ? String(left.tileId).localeCompare(String(right.tileId))
        : rightPressure - leftPressure;
    })
    .slice(0, 5);
  const recentTraces = band.causalTraces.slice(-6).reverse();
  const chosenAlternative = latestDecision?.alternativesConsidered[0];
  const pressureFields = chosenAlternative === undefined
    ? undefined
    : getPressureScoreSummary(chosenAlternative.scoreBreakdown);

  return (
    <>
      <div className="tile-detail-heading">Causal Pressure</div>
      {pressureState === undefined ? (
        <Detail label="state" value="not evaluated yet" />
      ) : (
        <>
          <Detail label="food stress" value={formatNumber(pressureState.foodStress)} />
          <Detail label="water stress" value={formatNumber(pressureState.waterStress)} />
          <Detail label="mobility pressure" value={formatNumber(pressureState.mobilityPressure)} />
          <Detail label="fatigue pressure" value={formatNumber(pressureState.fatiguePressure)} />
          <Detail label="risk pressure" value={formatNumber(pressureState.riskPressure)} />
          <Detail label="attachment pull" value={formatNumber(pressureState.placeAttachmentPull)} />
          <Detail label="net move pressure" value={formatNumber(pressureState.netMovePressure)} />
          <Detail
            label="proto-camp behavior"
            value={`return bias ${formatNumber(pressureState.protoCampReturnBias ?? 0)} · contested away ${formatNumber(pressureState.protoCampMoveAwayPressure ?? 0)}`}
          />
          <Detail
            label="access behavior"
            value={`caution ${formatNumber(pressureState.accessSensitiveCautionBias ?? 0)} · tolerance reduction ${formatNumber(pressureState.accessToleranceReductionBias ?? 0)} · kin relief ${formatNumber(pressureState.accessKinToleranceReliefBias ?? 0)} · contested avoid ${formatNumber(pressureState.accessContestedAvoidanceBias ?? 0)} · expected return ${formatNumber(pressureState.accessExpectedReturnBias ?? 0)}`}
          />
          <Detail
            label="relationship behavior"
            value={`practice ${formatNumber(pressureState.relationshipPracticeEfficiencyBias ?? 0)} · animal ${formatNumber(pressureState.relationshipAnimalCautionBias ?? 0)} · scavenger ${formatNumber(pressureState.relationshipScavengerRiskBias ?? 0)} · gathering ${formatNumber(pressureState.relationshipAggregationToleranceBias ?? 0)} · reputation ${formatNumber(pressureState.relationshipReputationToleranceBias ?? 0)} · failure ${formatNumber(pressureState.relationshipFailureCautionBias ?? 0)} · place ${formatNumber(pressureState.relationshipPlaceCharacterPull ?? 0)} · route ${formatNumber(pressureState.relationshipRouteConfidenceBias ?? 0)}`}
          />
          <Detail label="pressure confidence" value={formatNumber(pressureState.confidence)} />
        </>
      )}
      <UsePressureSummary label="current tile pressure" pressure={currentUsePressure} />
      <Detail
        label="pressure score"
        value={pressureFields ?? "no scored decision yet"}
      />
      {pressuredMemories.length === 0 ? (
        <Detail label="pressured places" value="none yet" />
      ) : (
        pressuredMemories.map((memory, index) => (
          <Detail
            key={`pressure:${memory.tileId}`}
            label={`pressured ${index + 1}`}
            value={`${memory.tileId} p=${formatNumber(
              getCombinedUsePressure(band.usePressure[memory.tileId]),
            )} attach=${formatNumber(memory.attachment)} ${memory.valences.join(",")}`}
          />
        ))
      )}
      {recentTraces.length === 0 ? (
        <Detail label="latest traces" value="none yet" />
      ) : (
        recentTraces.map((trace) => (
          <CausalTraceSummary key={trace.id} trace={trace} />
        ))
      )}
    </>
  );
}

// DEMOGRAPHY-MORTALITY-1 — compact demographic outlook + a death-cause hint from
// the band's own cohort/stress state (no hidden truth).
function demographicOutlook(band: Band): string {
  const demo = band.demography;
  const viability = band.viability?.status;

  if (viability === "extinct" || viability === "nonviable") {
    return "critical — at risk of collapse";
  }

  const base =
    viability === "fragile"
      ? "fragile / shrinking"
      : demo.mortalityPressure > demo.fertilityPressure + 0.12
        ? "shrinking"
        : demo.fertilityPressure > demo.mortalityPressure + 0.12
          ? "growing"
          : "stable";

  if ((demo.lastDeaths ?? 0) <= 0) {
    return base;
  }

  const cause =
    (demo.lastEldersDied ?? 0) >= (demo.lastDeaths ?? 0) * 0.5
      ? "mostly old age"
      : demo.foodPerPersonStress > 0.55
        ? "hunger / food deficit"
        : "sustained crisis";

  return `${base} · recent deaths: ${cause}`;
}

export function DemographyFissionDetails({
  band,
  world,
}: {
  readonly band: Band;
  readonly world: WorldState | null;
}) {
  const latestFission = band.fissionEvents[band.fissionEvents.length - 1];
  const parentBand = band.parentBandId === undefined || world === null
    ? undefined
    : world.bands[band.parentBandId];
  const daughterNames = world === null
    ? []
    : band.daughterBandIds.map((bandId) => world.bands[bandId]?.name ?? String(bandId));
  const latestFissionText =
    latestFission === undefined
      ? "none yet"
      : `${latestFission.daughterBandId} pop ${formatPopulation(
          latestFission.daughterPopulation,
        )} from ${latestFission.originTileId} to ${
          latestFission.targetTileId ?? "near parent"
        }`;

  return (
    <>
      <div className="tile-detail-heading">Demography & Fission</div>
      <Detail label="population" value={formatPopulation(band.demography.population)} />
      <Detail label="growth accumulator" value={formatNumber(band.demography.growthAccumulator)} />
      <Detail label="mortality accumulator" value={formatNumber(band.demography.mortalityAccumulator)} />
      <Detail label="households" value={String(band.demography.householdCount)} />
      <Detail
        label="age structure"
        value={`dependents=${band.demography.dependents} adults=${band.demography.workingAdults} elders=${band.demography.elders}`}
      />
      <Detail label="fertility pressure" value={formatNumber(band.demography.fertilityPressure)} />
      <Detail label="mortality pressure" value={formatNumber(band.demography.mortalityPressure)} />
      <Detail
        label="recent births / deaths (DEMOGRAPHY-MORTALITY-1)"
        value={`${band.demography.lastBirths ?? 0} born · ${band.demography.lastDeaths ?? 0} died · matured ${band.demography.lastDependentsMatured ?? 0} · aged-to-elder ${band.demography.lastAdultsAged ?? 0} · elders died ${band.demography.lastEldersDied ?? 0}`}
      />
      <Detail label="demographic outlook" value={demographicOutlook(band)} />
      <Detail label="food/person stress" value={formatNumber(band.demography.foodPerPersonStress)} />
      <Detail label="household crowding" value={formatNumber(band.demography.householdCrowdingPressure)} />
      <Detail label="split pressure" value={formatNumber(band.demography.splitPressure)} />
      <Detail label="fission threshold" value="split >= 0.64 and population >= 46" />
      <Detail
        label="last demo update"
        value={`${band.demography.lastDemographicUpdate.season} y${band.demography.lastDemographicUpdate.year} t${band.demography.lastDemographicUpdate.tick}`}
      />
      <Detail
        label="parent band"
        value={parentBand === undefined ? "none" : `${parentBand.name} (${parentBand.id})`}
      />
      <Detail
        label="daughter bands"
        value={daughterNames.length === 0 ? "none" : daughterNames.join(", ")}
      />
      <Detail label="fission events" value={String(band.fissionEvents.length)} />
      <Detail label="latest fission" value={latestFissionText} />
      <Detail
        label="latest split reason"
        value={latestFission === undefined ? "none" : formatReason(latestFission.splitReason)}
      />
      <Detail
        label="lineage"
        value={
          band.lineage === undefined
            ? "founder band"
            : `${band.lineage.relation} from ${band.lineage.parentBandId} at ${band.lineage.originTileId}`
        }
      />
    </>
  );
}

export function SeasonalSupportDetails({ band }: { readonly band: Band }) {
  const support = band.seasonalSupport;

  if (support === undefined) {
    return (
      <>
        <div className="tile-detail-heading">Seasonal Support</div>
        <Detail label="state" value="not evaluated yet" />
      </>
    );
  }

  const current = support.currentSeasonSupport;
  const last = support.lastSeasonSupport;

  return (
    <>
      <div className="tile-detail-heading">Seasonal Support</div>
      <Detail label="current season" value={`${current.season} y${current.year}`} />
      <Detail label="seasonal mode" value={current.mode} />
      <Detail label="raw support ratio" value={formatNumber(current.rawSupportRatio)} />
      <Detail label="clamped support ratio" value={formatNumber(current.clampedSupportRatio)} />
      <Detail label="seasonal modifier" value={formatNumber(current.seasonalModifier)} />
      <Detail label="food stress this season" value={formatNumber(current.foodStress)} />
      <Detail label="water stress this season" value={formatNumber(current.waterStress)} />
      <Detail label="per-capita return this season" value={formatNumber(current.perCapitaReturn)} />
      <Detail label="4-season return trend" value={`${formatNumber(support.rolling4SeasonReturn)} (${formatSigned(support.returnTrend4Season)})`} />
      <Detail label="8-season return trend" value={`${formatNumber(support.rolling8SeasonReturn)} (${formatSigned(support.returnTrend8Season)})`} />
      <Detail label="hunger classification" value={support.hungerClassification} />
      <Detail label="chronic deficit classification" value={support.chronicDeficitClassification} />
      <Detail
        label="deficit seasons"
        value={`last 4 ${support.deficitSeasonsLast4}/4 · last 8 ${support.deficitSeasonsLast8}/8 · hunger streak ${support.seasonalHungerStreak}`}
      />
      <Detail
        label="water-stress seasons"
        value={`last 4 ${support.waterStressSeasonsLast4}/4 · last 8 ${support.waterStressSeasonsLast8}/8`}
      />
      <Detail
        label="population vs hunger"
        value={
          support.populationStableDespiteRecurringHunger
            ? "population stable, but recurring lean-season hunger is visible"
            : "no hidden recurring-hunger stability flag"
        }
      />
      <Detail label="last season" value={last === undefined ? "none" : `${last.season}: support ${formatNumber(last.rawSupportRatio)}, return ${formatNumber(last.perCapitaReturn)}`} />
      <Detail label="top support reasons" value={support.topSeasonalSupportReasons.join(" · ")} />
    </>
  );
}

export function DemographicChurnDetails({ band }: { readonly band: Band }) {
  const churn = band.demography.demographicChurn;

  if (churn === undefined) {
    return (
      <>
        <div className="tile-detail-heading">Demographic Churn</div>
        <Detail label="state" value="not evaluated yet" />
      </>
    );
  }

  return (
    <>
      <div className="tile-detail-heading">Demographic Churn</div>
      <Detail label="births / deaths this year" value={`${churn.birthsThisYear} / ${churn.deathsThisYear}`} />
      <Detail label="births / deaths last 10 years" value={`${churn.birthsLast10Years} / ${churn.deathsLast10Years}`} />
      <Detail label="net change last 10 years" value={String(churn.netPopulationChangeLast10Years)} />
      <Detail label="years since birth / death" value={`${churn.yearsSinceLastBirth} / ${churn.yearsSinceLastDeath}`} />
      <Detail
        label="cohort transitions"
        value={`matured ${churn.dependentsMaturedThisYear} (${churn.dependentsMaturedLast10Years}/10y) · aged ${churn.adultsAgedThisYear} (${churn.adultsAgedLast10Years}/10y)`}
      />
      <Detail
        label="death causes this year"
        value={`elder ${churn.elderDeathsThisYear} · dependent ${churn.dependentDeathsThisYear} · adult ${churn.adultDeathsThisYear} · crisis ${churn.crisisDeathsThisYear} · water ${churn.waterStressDeathsThisYear} · food ${churn.starvationDeathsThisYear} · migration ${churn.migrationHardshipDeathsThisYear}`}
      />
      <Detail
        label="death causes last 10 years"
        value={`elder ${churn.elderDeathsLast10Years} · dependent ${churn.dependentDeathsLast10Years} · adult ${churn.adultDeathsLast10Years} · crisis ${churn.crisisDeathsLast10Years} · water ${churn.waterStressDeathsLast10Years} · food ${churn.starvationDeathsLast10Years} · migration ${churn.migrationHardshipDeathsLast10Years}`}
      />
      <Detail label="demographic outlook" value={churn.demographicOutlook} />
      <Detail
        label="stable hides churn"
        value={churn.stablePopulationHidesChurn ? `yes: births ${churn.birthsLast10Years} / deaths ${churn.deathsLast10Years}` : "no"}
      />
    </>
  );
}

export function NoDeathAuditDetails({ band }: { readonly band: Band }) {
  const audit = band.demography.noDeathAudit;

  return (
    <>
      <div className="tile-detail-heading">No-Death Audit</div>
      {audit === undefined ? (
        <Detail label="state" value="not evaluated yet" />
      ) : (
        <>
          <Detail label="no-death streak" value={`${audit.noDeathStreakYears} years`} />
          <Detail label="25+ / 50+" value={`${audit.noDeath25Years ? "yes" : "no"} / ${audit.noDeath50Years ? "yes" : "no"}`} />
          <Detail label="classification" value={audit.classification} />
          <Detail label="suspicious" value={audit.suspicious ? "yes" : "no"} />
          <Detail label="why" value={audit.why} />
        </>
      )}
    </>
  );
}

export function DeathMemoryDetails({ band }: { readonly band: Band }) {
  const memory = band.deathMemory;

  return (
    <>
      <div className="tile-detail-heading">Death Memory / Caution</div>
      {memory === undefined ? (
        <Detail label="state" value="no recent death memory" />
      ) : (
        <>
          <Detail label="recent deaths" value={`${memory.recentDeathCount} total · dependent ${memory.recentDependentDeaths} · adult ${memory.recentAdultDeaths} · elder ${memory.recentElderDeaths}`} />
          <Detail label="cause" value={memory.deathMemoryCause ?? "unknown"} />
          <Detail label="severity" value={formatNumber(memory.deathMemorySeverity)} />
          <Detail label="caution modifier" value={formatNumber(memory.cautionModifier)} />
          <Detail label="fertility suppression" value={formatNumber(memory.fertilitySuppressionFromRecentDeaths)} />
          <Detail label="avoid place pressure" value={`${formatNumber(memory.avoidPlacePressure)}${memory.placeTileId === undefined ? "" : ` at ${String(memory.placeTileId)}`}`} />
        </>
      )}
    </>
  );
}

export function InnerFissionDetails({ band }: { readonly band: Band }) {
  const fission = band.innerFission;

  return (
    <>
      <div className="tile-detail-heading">Inner Fission</div>
      {fission === undefined ? (
        <Detail label="state" value="not evaluated yet" />
      ) : (
        <>
          <Detail label="state" value={fission.state} />
          <Detail label="pressure score" value={formatNumber(fission.pressureScore)} />
          <Detail label="top causes" value={fission.topCauses.length === 0 ? "none" : fission.topCauses.join(" | ")} />
          <Detail label="split delayed" value={fission.splitDelayed ? fission.splitDelayedReason ?? "yes" : "no"} />
          <Detail label="unity recovering" value={fission.unityRecovering ? fission.unityRecoveryReason ?? "yes" : "no"} />
          <Detail
            label="tension split"
            value={`hunger ${formatNumber(fission.hungerTension)} · water ${formatNumber(fission.waterTension)} · deaths ${formatNumber(fission.deathTension)} · migration ${formatNumber(fission.migrationTension)} · support ${formatNumber(fission.supportSeekingTension)}`}
          />
          <Detail
            label="behavior hooks"
            value={`scout ${formatNumber(fission.scoutingPressure)} · move debate ${formatNumber(fission.residentialDebatePressure)} · support seek ${formatNumber(fission.supportSeekingPressure)}`}
          />
          <Detail label="proto-identity hook" value={fission.protoIdentityHook ? "yes" : "no"} />
          <Detail label="event hooks" value={fission.eventHooks.join(", ")} />
        </>
      )}
    </>
  );
}

export function SocialTensionDetails({ band }: { readonly band: Band }) {
  const tension = band.socialTension;

  return (
    <>
      <div className="tile-detail-heading">Social Tension</div>
      {tension === undefined ? (
        <Detail label="state" value="not evaluated yet" />
      ) : (
        <>
          <Detail label="cohesion" value={`${formatNumber(tension.cohesion)} · ${tension.cohesionStatus}`} />
          <Detail label="tolerance" value={`${formatNumber(tension.tolerance)} · ${tension.toleranceStatus}`} />
          <Detail label="hostility" value={tension.hostilityStatus} />
          <Detail
            label="crowded kin/resources"
            value={`${formatNumber(tension.crowdedKinResourcePressure)} · ${tension.crowdedKinResourcePressureStatus}`}
          />
          <Detail label="social tension pressure" value={formatNumber(tension.socialTensionPressure)} />
          <Detail
            label="vagueness / direction blur"
            value={`${tension.protectiveVaguenessCount} / ${tension.directionBlurredCount} · ${tension.protectiveVaguenessStatus}`}
          />
          <Detail label="top causes" value={tension.topCauses.length === 0 ? "none" : tension.topCauses.join(" | ")} />
          {tension.relationCategories.length === 0 ? (
            <Detail label="relation categories" value="none grounded" />
          ) : (
            tension.relationCategories.map((relation, index) => (
              <Detail
                key={`${relation.otherBandId ?? relation.category}:${index}`}
                label={`relation ${index + 1}`}
                value={`${relation.otherBandId ?? "self"} · ${relation.category} · tolerance ${formatNumber(relation.tolerance)} · tension ${formatNumber(relation.tension)} · ${relation.grounding}`}
              />
            ))
          )}
          <Detail label="event hooks" value={tension.eventHooks.join(", ")} />
        </>
      )}
    </>
  );
}

export function BandConditionProfileDetails({ band }: { readonly band: Band }) {
  const profile = band.conditionProfile;

  return (
    <>
      <div className="tile-detail-heading">Overview / Condition</div>
      {profile === undefined ? (
        <Detail label="state" value="not evaluated yet" />
      ) : (
        <>
          <Detail label="summary" value={profile.summary} />
          <Detail label="survival" value={profile.survivalCondition} />
          <Detail label="internal" value={profile.internalCondition} />
          <Detail label="weak-band" value={profile.weakBandCondition} />
          <Detail label="social" value={profile.socialCondition} />
          <Detail label="top drivers" value={profile.topDrivers.length === 0 ? "none" : profile.topDrivers.join(" | ")} />
          <Detail label="raw sources" value={profile.rawSources.length === 0 ? "none" : profile.rawSources.join(", ")} />
          <Detail label="reason ids" value={formatReasonIds(profile.reasonIds.map(String))} />
        </>
      )}
    </>
  );
}

export function BandEventHistoryDetails({ band }: { readonly band: Band }) {
  const history = band.eventHistory;
  const [filter, setFilter] = useState<BandEventFilter>("all");

  if (history === undefined) {
    return (
      <>
        <div className="tile-detail-heading">Recent Events</div>
        <Detail label="state" value="not evaluated yet" />
      </>
    );
  }

  const events = history.recentEvents.filter((event) => filter === "all" || event.category === filter);

  return (
    <>
      <div className="tile-detail-heading">Recent Events</div>
      <Detail label="bounded memory" value={`recent ${history.recentEvents.length}/${history.boundedEventLimit} · last10 ${history.last10Years.length} · last25 ${history.last25Years.length} · dropped ${history.droppedRecentEventCount}`} />
      <Detail label="lifetime summary" value={`total ${history.lifetimeSummary.totalEvents} · categories ${formatCountSummary(history.lifetimeSummary.byCategory)} · salience ${formatCountSummary(history.lifetimeSummary.bySalience)}`} />
      <Detail label="duplicate spam filtered" value={String(history.duplicateSpamFiltered)} />
      <div className="talk-filter-row" role="list" aria-label="event filters">
        {BAND_EVENT_FILTERS.map((entry) => (
          <button
            key={entry.key}
            type="button"
            className={filter === entry.key ? "talk-filter-button active" : "talk-filter-button"}
            onClick={() => setFilter(entry.key)}
          >
            {entry.label}
          </button>
        ))}
      </div>
      {events.length === 0 ? (
        <Detail label="events" value="none in this filter" />
      ) : (
        events.slice(0, 16).map((event, index) => (
          <Detail
            key={String(event.eventId)}
            label={`${index + 1}. ${event.salience} ${event.category}`}
            value={`Y${event.year} ${event.season}: ${event.title} — ${event.description} · raw ${event.rawSource}: ${event.rawReason}${event.detail === undefined ? "" : ` · ${event.detail}`}`}
          />
        ))
      )}
      <Detail label="reason ids" value={formatReasonIds(history.reasonIds.map(String))} />
    </>
  );
}

export function CampRumorReadabilityDetails({ band }: { readonly band: Band }) {
  const rumors = band.campRumors;

  return (
    <>
      <div className="tile-detail-heading">Camp Rumor Mill</div>
      {rumors === undefined ? (
        <Detail label="state" value="not evaluated yet" />
      ) : (
        <>
          <Detail label="grounding" value={rumors.note} />
          <Detail
            label="caps"
            value={`items ${rumors.items.length}/${rumors.itemCap} · dropped ${rumors.droppedItemCount} · suppressed repeats ${rumors.suppressedRepeatCount} · ledger ${rumors.repetitionLedger.length}`}
          />
          <Detail label="category counts" value={formatCountSummary(rumors.categoryCounts)} />
          <Detail label="salience counts" value={formatCountSummary(rumors.salienceCounts)} />
          {rumors.items.length === 0 ? (
            <Detail label="items" value="no grounded rumor/readability items" />
          ) : (
            rumors.items.map((item, index) => (
              <Detail
                key={item.id}
                label={`${index + 1}. ${item.salience} ${item.category}`}
                value={`${item.summary} · tone ${item.tone} · family ${item.family} · repeats ${item.occurrenceCount}/${item.compressedRepeatCount} · why ${item.whyShown} · raw ${item.rawSource}: ${item.rawReason} · confidence ${item.confidenceStatus}${item.relatedBandId === undefined ? "" : ` · related band ${String(item.relatedBandId)}`}${item.relatedTileId === undefined ? "" : ` · tile ${String(item.relatedTileId)}`}`}
              />
            ))
          )}
          {rumors.repetitionLedger.length === 0 ? null : (
            <Detail
              label="repetition ledger"
              value={rumors.repetitionLedger.slice(0, 8).map((entry) => `${entry.family}:${entry.count} suppressed ${entry.suppressedCount} last ${Number(entry.lastTick)}`).join(" | ")}
            />
          )}
          <Detail label="reason ids" value={formatReasonIds(rumors.reasonIds.map(String))} />
        </>
      )}
    </>
  );
}

export function LineageReadabilityDetails({ band }: { readonly band: Band }) {
  const lineage = band.lineageReadability;

  return (
    <>
      <div className="tile-detail-heading">Lineage Readability</div>
      {lineage === undefined ? (
        <Detail label="state" value="not evaluated yet" />
      ) : (
        <>
          <Detail label="display" value={lineage.displayLabel} />
          <Detail label="origin" value={String(lineage.originBandId)} />
          <Detail label="parent" value={lineage.parentBandId === undefined ? "none" : String(lineage.parentBandId)} />
          <Detail label="daughters" value={lineage.daughterBandIds.length === 0 ? "none" : lineage.daughterBandIds.map(String).join(", ")} />
          <Detail label="depth" value={`${lineage.generationDepth} · ${lineage.generationLabel}`} />
          <Detail label="path" value={lineage.lineagePath.map(String).join(" → ")} />
          <Detail label="active status" value={lineage.activeStatus} />
          <Detail label="absorbed by" value={lineage.absorbedByBandId === undefined ? "none" : String(lineage.absorbedByBandId)} />
          <Detail label="relation category" value={lineage.relationCategory ?? "none grounded"} />
          <Detail label="raw source" value={lineage.rawSource} />
        </>
      )}
    </>
  );
}

export function ProtoCampDetails({ band }: { readonly band: Band }) {
  const memory = band.protoCampMemory;

  return (
    <>
      <div className="tile-detail-heading">Camp / Place Memory</div>
      {memory === undefined ? (
        <Detail label="state" value="not evaluated yet" />
      ) : (
        <>
          <Detail label="memory boundedness" value={`top ${memory.topPlaces.length}/${memory.memoryCap} · candidate cap ${memory.candidateTileCap} · display reason cap ${memory.displayReasonCap} · family cap ${memory.reasonFamilyCap} · dropped ${memory.droppedLowSalienceCount}`} />
          <Detail
            label="behavior effect"
            value={`return ${formatNumber(memory.behavior.returnBias)} · seasonal ${formatNumber(memory.behavior.seasonalReturnBias)} · dry anchor ${formatNumber(memory.behavior.drySeasonAnchorBias)} · caution ${formatNumber(memory.behavior.riskyMoveCautionBias)} · contested away ${formatNumber(memory.behavior.contestedMoveAwayPressure)} · remnant hold ${formatNumber(memory.behavior.weakRemnantHoldBias)} · processing ${formatNumber(memory.behavior.processingCampReturnBias)} · crossing ${formatNumber(memory.behavior.crossingCampRouteBias)} · rest overuse ${formatNumber(memory.behavior.restOverusedCampBias)}`}
          />
          <Detail label="behavior guards" value={`reversible=${memory.behavior.reversible} · no sedentism=${memory.behavior.noSedentism} · no storage=${memory.behavior.noStorageEconomy} · no territory=${memory.behavior.noTerritory}`} />
          {memory.currentPlace === undefined ? (
            <Detail label="current place" value="no camp-like current place" />
          ) : (
            <ProtoCampPlaceDetail label="current place" place={memory.currentPlace} />
          )}
          {memory.topPlaces.length === 0 ? (
            <Detail label="top places" value="none" />
          ) : (
            memory.topPlaces.slice(0, 6).map((place, index) => (
              <ProtoCampPlaceDetail key={String(place.tileId)} label={`place ${index + 1}`} place={place} />
            ))
          )}
          <Detail label="reason ids" value={formatReasonIds(memory.reasonIds.map(String))} />
        </>
      )}
    </>
  );
}

export function ProtoAccessDetails({ band }: { readonly band: Band }) {
  const memory = band.protoAccessMemory;

  return (
    <>
      <div className="tile-detail-heading">Proto-access / Shared-use Expectations</div>
      {memory === undefined ? (
        <Detail label="state" value="not evaluated yet" />
      ) : (
        <>
          <Detail label="memory boundedness" value={`top ${memory.topPlaces.length}/${memory.memoryCap} · candidate cap ${memory.candidateTileCap} · reason cap ${memory.reasonCap} · dropped ${memory.droppedLowSalienceCount}`} />
          <Detail
            label="behavior hooks"
            value={`caution ${formatNumber(memory.behavior.sensitivePlaceCautionBias)} · tolerance reduction ${formatNumber(memory.behavior.toleranceReductionBias)} · kin relief ${formatNumber(memory.behavior.kinToleranceReliefBias)} · contested avoid ${formatNumber(memory.behavior.contestedAvoidanceBias)} · support hesitation ${formatNumber(memory.behavior.supportSeekingHesitationBias)} · expected return ${formatNumber(memory.behavior.expectedReturnBias)} · max ${formatNumber(memory.behavior.maxBehaviorHook)}`}
          />
          <Detail
            label="behavior guards"
            value={`reversible=${memory.behavior.reversible} · no conflict=${memory.behavior.noConflict} · no expulsion=${memory.behavior.noExpulsion} · no fixed borders=${memory.behavior.noFixedBorders} · no property=${memory.behavior.noProperty} · no law=${memory.behavior.noLaw} · no war=${memory.behavior.noWar}`}
          />
          <Detail
            label="anti-omniscience"
            value={`band memory only=${memory.antiOmniscience.derivedFromBandMemoryOnly} · no hidden map truth=${memory.antiOmniscience.noHiddenMapTruth} · no hidden band reaction=${memory.antiOmniscience.noHiddenBandReaction}`}
          />
          {memory.currentPlace === undefined ? (
            <Detail label="current access" value="no salient current access expectation" />
          ) : (
            <ProtoAccessPlaceDetail label="current access" place={memory.currentPlace} />
          )}
          {memory.topPlaces.length === 0 ? (
            <Detail label="top access memories" value="none" />
          ) : (
            memory.topPlaces.slice(0, 8).map((place, index) => (
              <ProtoAccessPlaceDetail key={String(place.tileId)} label={`access ${index + 1}`} place={place} />
            ))
          )}
          <Detail label="reason ids" value={formatReasonIds(memory.reasonIds.map(String))} />
        </>
      )}
    </>
  );
}

export function ResourceEcologyDetails({ band }: { readonly band: Band }) {
  const ecology = band.resourceEcology;

  return (
    <>
      <div className="tile-detail-heading">Resource Support</div>
      {ecology === undefined ? (
        <Detail label="state" value="not evaluated yet" />
      ) : (
        <>
          <Detail
            label="support bridge"
            value={`raw ${formatNumber(ecology.support.totalRawSupport)} · clamped ${formatNumber(ecology.support.clampedSupportRatio)} · explained ${formatNumber(ecology.support.explainedByResourceClass)} (${formatNumber(ecology.support.explainedShare)}) · abstract remainder ${formatNumber(ecology.support.abstractRemainder)} · seasonal ${formatNumber(ecology.support.seasonalResourceModifier)}`}
          />
          <Detail
            label="domains"
            value={`plants ${formatNumber(ecology.support.plantContribution)} · aquatic ${formatNumber(ecology.support.aquaticContribution)} · animal ${formatNumber(ecology.support.animalForagingContribution)} · fallback ${formatNumber(ecology.support.fallbackContribution)} · water/refuge ${formatNumber(ecology.support.waterRefugeContribution)}`}
          />
          <Detail
            label="top classes"
            value={ecology.support.topContributingClasses.length === 0
              ? "none"
              : ecology.support.topContributingClasses.slice(0, 5).map((entry) => `${entry.label} ${formatNumber(entry.supportContribution)} share ${formatNumber(entry.supportShare)} · ${entry.knowledgeState}/${entry.knowledgeSource} · pressure ${formatNumber(entry.pressure)} · source ${entry.abstractSourceClassId ?? "none"}`).join(" | ")}
          />
          <Detail label="weak/missing" value={ecology.support.weakMissingClasses.join(", ") || "none"} />
          <Detail
            label="pressure hooks"
            value={ecology.support.pressureEffects.length === 0
              ? "none"
              : ecology.support.pressureEffects.map((entry) => `${entry.classId} pressure ${formatNumber(entry.pressure)} loss ${formatNumber(entry.pressureLoss)} [${entry.reason}]`).join(" | ")}
          />
          <div className="tile-detail-heading">Resource Knowledge</div>
          <Detail
            label="knowledge counts"
            value={`memories ${ecology.knowledge.memoryCount}/${ecology.knowledge.memoryCap} · classes ${ecology.knowledge.knownResourceClasses.join(", ") || "none"} · states ${Object.entries(ecology.knowledge.stateCounts).map(([key, value]) => `${key}:${value}`).join(" ")}`}
          />
          <Detail
            label="anti-omniscience"
            value={`fully known without memory ${ecology.knowledge.antiOmniscience.fullyKnownWithoutMemoryCount} · inferred-only ${ecology.knowledge.antiOmniscience.inferredOnlyWithoutUse} · no every-resource-known ${ecology.knowledge.antiOmniscience.noEveryResourceKnown}`}
          />
          <Detail
            label="top memories"
            value={ecology.knowledge.topMemories.length === 0
              ? "none"
              : ecology.knowledge.topMemories.slice(0, 6).map((entry) => `${entry.label}@${String(entry.placeTileId)} ${entry.knowledgeState}/${entry.source} conf ${formatNumber(entry.confidence)} success ${entry.successCount} fail ${entry.failureCount}`).join(" | ")}
          />
          <div className="tile-detail-heading">Storage Suitability / Keeping Burden</div>
          <Detail
            label="summary"
            value={`cards ${ecology.storageSuitabilitySummary.cardCount}/${ecology.storageSuitabilitySummary.cardCap} · food ${ecology.storageSuitabilitySummary.foodCardCount} · material ${ecology.storageSuitabilitySummary.materialCardCount} · best buffer ${ecology.storageSuitabilitySummary.bestSeasonalBufferClassId ?? "none"} · perishable ${ecology.storageSuitabilitySummary.mostPerishableClassId ?? "none"} · carry concern ${ecology.storageSuitabilitySummary.carryingConcernClassId ?? "none"}`}
          />
          <Detail
            label="anti-omniscience / guards"
            value={`hidden truth cards ${ecology.storageSuitabilitySummary.antiOmniscience.hiddenTruthCardCount} · band-known only ${ecology.storageSuitabilitySummary.antiOmniscience.cardsFromBandKnownSourcesOnly} · low-confidence inference ${ecology.storageSuitabilitySummary.antiOmniscience.lowConfidenceInferenceCount} · no stockpile ${ecology.storageSuitabilitySummary.guards.noActualStockpile} · no stored food bank ${ecology.storageSuitabilitySummary.guards.noStoredFoodBank} · no granary ${ecology.storageSuitabilitySummary.guards.noGranary}`}
          />
          <Detail
            label="cards"
            value={ecology.storageSuitabilityCards.length === 0
              ? "none"
              : ecology.storageSuitabilityCards.slice(0, 8).map((card) => `${card.label}:${card.storageSuitability}/${card.perishability} cache ${card.cacheSuitability} dry ${card.dryingSuitability} smoke ${card.smokingSuitability} labor ${card.processingLabor} carry ${card.carryBurden} spoil ${card.spoilageRisk} buffer ${card.seasonalBufferValue} risk ${card.riskIfMishandled} cross ${card.crossingMaterialUse} conf ${formatNumber(card.storageConfidence)} ${card.confidenceKind}/${card.antiOmniscienceStatus} proto ${card.protoCampRelevance}`).join(" | ")}
          />
          <div className="tile-detail-heading">Resource / Place Memory</div>
          <Detail
            label="top places"
            value={ecology.topResourcePlaceMemories.length === 0
              ? "none"
              : ecology.topResourcePlaceMemories.slice(0, 6).map((entry) => `${entry.label}@${String(entry.tileId)} uses ${entry.visitsOrUses} +${entry.seasonalSuccessCount}/-${entry.seasonalFailureCount} support ${formatNumber(entry.contributionToSupport)} pressure ${formatNumber(entry.pressure)} proto ${entry.protoCampReasonLinks.join(";") || "none"}`).join(" | ")}
          />
          <div className="tile-detail-heading">Activity Resource Trace</div>
          <Detail
            label="recent activity"
            value={ecology.activityResourceTraces.length === 0
              ? "none"
              : ecology.activityResourceTraces.slice(0, 6).map((entry) => `${entry.activityType} → ${entry.label}@${String(entry.targetTileId)} ${entry.outcome} · expected ${formatNumber(entry.expectedContribution)} · ${entry.knowledgeUpdate}${entry.storageSuitability === undefined ? "" : ` · storage ${entry.storageSuitability.storageSuitability}/${entry.storageSuitability.perishability} labor ${entry.storageSuitability.processingLabor} carry ${entry.storageSuitability.carryBurden}: ${entry.storageSuitability.note}`}`).join(" | ")}
          />
          <Detail label="guards" value={`bounded=${ecology.bounded} · no species=${ecology.noNamedSpecies} · no storage economy=${ecology.noStorageEconomy} · no stored food bank=${ecology.noStoredFoodBank} · no agriculture=${ecology.noAgriculture} · no full ecology=${ecology.noFullPlantFaunaEcology}`} />
        </>
      )}
    </>
  );
}

export function VisibleNatureDetails({ band }: { readonly band: Band }) {
  const nature = band.visibleNature;

  return (
    <>
      <div className="tile-detail-heading">Visible Nature / Player-Known Layer</div>
      {nature === undefined ? (
        <Detail label="state" value="not evaluated yet" />
      ) : (
        <>
          <Detail
            label="headlines"
            value={`${nature.natureHeadline} | animals: ${nature.animalHeadline} | aquatic: ${nature.aquaticHeadline} | plants: ${nature.plantHeadline}`}
          />
          <Detail
            label="caps"
            value={`candidate tiles ${nature.memoryCaps.candidateTileCap} · fauna ${nature.faunaCards.length}/${nature.memoryCaps.faunaCardCap} · aquatic ${nature.aquaticCards.length}/${nature.memoryCaps.aquaticCardCap} · plants ${nature.plantCards.length}/${nature.memoryCaps.plantCardCap} · animal knowledge ${nature.animalKnowledge.length}/${nature.memoryCaps.animalKnowledgeCap} · acute ${nature.acuteEpisodes.length}/${nature.memoryCaps.acuteEpisodeCap}`}
          />
          <Detail
            label="fauna cards"
            value={nature.faunaCards.length === 0
              ? "none"
              : nature.faunaCards.slice(0, 6).map((card) => `${card.label}@${String(card.anchorTileId)} ${card.knowledgeState} conf ${formatNumber(card.confidence)} risk ${formatNumber(card.risk)} abundance ${card.perceivedAbundance} tags ${card.tags.slice(0, 4).join(",")} [${card.rawSource}]`).join(" | ")}
          />
          <Detail
            label="aquatic cards"
            value={nature.aquaticCards.length === 0
              ? "none"
              : nature.aquaticCards.slice(0, 6).map((card) => `${card.label}@${String(card.anchorTileId)} ${card.waterContext}/${card.knowledgeState} effect ${card.aquaticEffect} availability ${formatNumber(card.seasonalAvailability)} productivity ${card.abundanceProductivity} pressure ${formatNumber(card.pressure)} recovery ${formatNumber(card.recovery)} reliability ${formatNumber(card.reliability)} access ${formatNumber(card.laborAccessCost)} risk ${formatNumber(card.riskDifficulty)} proto ${card.protoCampLink} [${card.rawSource}]`).join(" | ")}
          />
          <Detail
            label="plant cards"
            value={nature.plantCards.length === 0
              ? "none"
              : nature.plantCards.slice(0, 6).map((card) => `${card.label}@${String(card.tileId)} ${card.knowledgeState}/${card.useStatus} effect ${card.plantPatchEffect} availability ${card.previousSeasonalAvailability}->${card.seasonalAvailability} trend ${card.abundanceTrend} abundance ${formatNumber(card.abundance)} pressure ${formatNumber(card.pressure)} depletion ${formatNumber(card.depletion)} recovery ${formatNumber(card.recovery)} fallback ${card.fallbackRole} labor ${formatNumber(card.laborCost)} risk ${card.risk} grazing ${formatNumber(card.animalGrazingPressure)} [${card.rawSource}]`).join(" | ")}
          />
          <Detail
            label="animal knowledge"
            value={nature.animalKnowledge.length === 0
              ? "none"
              : nature.animalKnowledge.slice(0, 6).map((entry) => `${entry.archetype} ${entry.state}/${entry.source} conf ${formatNumber(entry.confidence)} +${entry.successCount}/-${entry.failureCount}${entry.riskOrAvoidanceNote === undefined ? "" : ` note ${entry.riskOrAvoidanceNote}`}`).join(" | ")}
          />
          <Detail
            label="perceptions"
            value={nature.animalPerceptions.length === 0
              ? "none"
              : nature.animalPerceptions.slice(0, 6).map((entry) => `${entry.archetype}: ${entry.perception.join(",")} conf ${formatNumber(entry.confidence)} reason ${entry.reason}`).join(" | ")}
          />
          <Detail
            label="domestication trajectories"
            value={nature.domesticationTrajectories.length === 0
              ? "none"
              : nature.domesticationTrajectories.slice(0, 6).map((entry) => `${entry.archetype} ${entry.stage} pathway ${entry.pathway} candidate=${entry.candidate} tolerance ${formatNumber(entry.animalTolerance)} failure ${formatNumber(entry.failurePressure)} limits ${entry.explicitLimits.join(";")}`).join(" | ")}
          />
          <Detail
            label="acute episodes"
            value={nature.acuteEpisodes.length === 0
              ? "none"
              : nature.acuteEpisodes.map((entry) => `${entry.kind} severity ${formatNumber(entry.severity)} ${entry.durationClass} outcome ${entry.outcome} trigger ${entry.trigger} raw ${entry.rawGrounding}`).join(" | ")}
          />
          <Detail
            label="anti-omniscience"
            value={`candidate tiles from band knowledge=${nature.antiOmniscience.candidateTilesFromBandKnowledgeOnly} · exact hidden stock locations revealed=${nature.antiOmniscience.exactHiddenStockLocationsRevealed} · every resource known=${nature.antiOmniscience.everyResourceKnown}`}
          />
          <Detail
            label="guards"
            value={`no individual agents=${nature.guards.noIndividualAnimalAgents} · no instant domestication=${nature.guards.noInstantDomestication} · no riding/mount=${nature.guards.noRidingOrMountBonus} · no agriculture=${nature.guards.noAgriculture} · no culture/religion/territory/war=${nature.guards.noCultureReligionTerritoryWar}`}
          />
        </>
      )}
    </>
  );
}

export function AcuteRiskDetails({ band }: { readonly band: Band }) {
  const state = band.acuteRisk;

  return (
    <>
      <div className="tile-detail-heading">Acute Risk / Short-Term Hardship</div>
      {state === undefined ? (
        <Detail label="state" value="not evaluated yet" />
      ) : (
        <>
          <Detail
            label="active effect"
            value={`stress +${formatNumber(state.activeEffect.extraSeasonalStress)} · activity penalty ${formatNumber(state.activeEffect.activityEfficiencyPenalty)} · mortality pressure +${formatNumber(state.activeEffect.mortalityRiskBump)} · movement caution +${formatNumber(state.activeEffect.movementCautionBump)} · knowledge ${formatNumber(state.activeEffect.knowledgeUpdateWeight)} · recovery ${state.activeEffect.recoverySeasons}`}
          />
          <Detail
            label="caps / boundedness"
            value={`recent ${state.recentEpisodes.length}/${state.memoryCaps.recentEpisodeCap} · max per band-season ${state.memoryCaps.maxEpisodesPerBandSeason} · dropped ${state.droppedEpisodeCount} · expired ${state.expiredEpisodeCount} · bounded=${state.bounded} · no full map scan=${state.noFullMapScan} · no individual people=${state.noIndividualPeople}`}
          />
          <Detail
            label="trace"
            value={`candidates ${state.trace.consideredCandidateCount} · generated ${state.trace.generatedEpisodeCount} · capped ${state.trace.cappedBySeasonLimit} · sources ${state.trace.candidateSourceCategories.join(",") || "none"} · band-known only=${state.trace.usedBandKnownContextOnly}`}
          />
          <Detail
            label="recent episodes"
            value={state.recentEpisodes.length === 0
              ? "none"
              : state.recentEpisodes.map((episode) =>
                  `${episode.id} ${episode.kind}/${episode.severity} tick ${Number(episode.tick)} ${episode.context.sourceCategory}:${episode.context.sourceLabel} effect stress ${formatNumber(episode.effect.extraSeasonalStress)} activity ${formatNumber(episode.effect.activityEfficiencyPenalty)} mortality ${formatNumber(episode.effect.mortalityRiskBump)} caution ${formatNumber(episode.effect.movementCautionBump)} recovery ${episode.remainingRecoverySeasons} memory ${episode.memoryUpdates.join(";") || "none"} reasons ${episode.groundedReasons.join(";")} factors ${episode.contributingFactors.join(";")}`,
                ).join(" | ")}
          />
          <Detail label="reason ids" value={state.trace.reasonIds.join(", ") || "none"} />
        </>
      )}
    </>
  );
}

function ProtoCampPlaceDetail({
  label,
  place,
}: {
  readonly label: string;
  readonly place: NonNullable<Band["protoCampMemory"]>["topPlaces"][number];
}) {
  return (
    <Detail
      label={label}
      value={`${String(place.tileId)} · ${place.campLikeState} · ${place.activeStatus} · trend ${place.lifecycleTrend} · seasonal ${place.seasonalIdentity} · pressure ${place.usePressureStatus} · score ${formatNumber(place.campLikeScore)} · confidence ${formatNumber(place.confidence)} · visits ${place.visitCount} · consecutive ${place.consecutiveUseCount} · seasons ${place.seasonsUsed.join(",") || "none"} · water/refuge ${formatNumber(place.waterRefugeReliability)} · storage ${formatNumber(place.storageProcessingScore)} · crossing ${formatNumber(place.crossingUseScore)} · ecological pressure/recovery ${formatNumber(place.ecologicalPressure)}/${formatNumber(place.ecologicalRecovery)} · activity trend +${formatNumber(place.activitySuccessTrend)}/-${formatNumber(place.activityFailureTrend)} · activity +${place.activitySuccessCountNearby}/-${place.activityFailureCountNearby} · anchor uses ${place.residentialAnchorUseCount} · kin ${formatNumber(place.knownKinContactNearby)} · crowd ${formatNumber(place.socialCrowdingPressureNearby)} · raw/display reasons +${place.rawPositiveReasonCount}/${place.positiveReasons.length} -${place.rawNegativeReasonCount}/${place.negativeReasons.length} · families ${formatProtoCampFamilies(place.reasonFamilies)} · positives ${formatProtoCampFactors(place.positiveReasons)} · negatives ${formatProtoCampFactors(place.negativeReasons)}`}
    />
  );
}

function ProtoAccessPlaceDetail({
  label,
  place,
}: {
  readonly label: string;
  readonly place: NonNullable<Band["protoAccessMemory"]>["topPlaces"][number];
}) {
  return (
    <Detail
      label={label}
      value={`${String(place.tileId)} · ${place.accessState} · ${place.placeType} · importance ${formatNumber(place.accessImportance)} · sensitivity ${formatNumber(place.placeSensitivity)} · familiar ${formatNumber(place.familiarUseStrength)} · repeated ${formatNumber(place.repeatedReturnStrength)} · kin ${formatNumber(place.kinTolerance)} · familiar tolerance ${formatNumber(place.familiarTolerance)} · stranger ${formatNumber(place.strangerCaution)} · shared ${formatNumber(place.sharedUsePressure)} · crowding ${formatNumber(place.crowdingResourcePressure)} · avoidance ${formatNumber(place.rememberedRefusalAvoidance)} · cooperation ${formatNumber(place.rememberedCooperationTolerance)} · tone ${place.recentEncounterTone} · confidence ${formatNumber(place.confidence)} · stale ${place.staleYears}y/${formatNumber(place.staleness)} · positives ${place.positiveReasons.map((reason) => `${reason.family}:${reason.reason}:${formatNumber(reason.strength)}`).join(";") || "none"} · negatives ${place.negativeReasons.map((reason) => `${reason.family}:${reason.reason}:${formatNumber(reason.strength)}`).join(";") || "none"} · source ids ${formatReasonIds(place.sourceReasonIds.map(String))} · guards hiddenBands=${place.antiOmniscience.noHiddenBands} hiddenResources=${place.antiOmniscience.noHiddenResources} fixedRule=${place.antiOmniscience.noFixedAccessRule}`}
    />
  );
}

function formatProtoCampFactors(factors: readonly { readonly reason: string; readonly strength: number; readonly rawSource: string; readonly family?: string }[]): string {
  if (factors.length === 0) {
    return "none";
  }

  return factors.slice(0, 4).map((factorEntry) => `${factorEntry.reason} ${formatNumber(factorEntry.strength)}${factorEntry.family === undefined ? "" : `/${factorEntry.family}`} [${factorEntry.rawSource}]`).join(" | ");
}

function formatProtoCampFamilies(
  families: readonly {
    readonly family: string;
    readonly positiveStrength: number;
    readonly negativeStrength: number;
    readonly rawReasonCount: number;
    readonly displayReasonCount: number;
    readonly topPositiveReason?: string;
    readonly topNegativeReason?: string;
  }[],
): string {
  if (families.length === 0) {
    return "none";
  }

  return families.slice(0, 6).map((family) =>
    `${family.family} +${formatNumber(family.positiveStrength)}/-${formatNumber(family.negativeStrength)} raw ${family.rawReasonCount} shown ${family.displayReasonCount} top ${family.topPositiveReason ?? family.topNegativeReason ?? "none"}`
  ).join(" | ");
}

export function UsePressureSummary({
  label,
  pressure,
}: {
  readonly label: string;
  readonly pressure: LocalUsePressureRecord | undefined;
}) {
  if (pressure === undefined) {
    return <Detail label={label} value="none yet" />;
  }

  return (
    <Detail
      label={label}
      value={`use=${pressure.useTicks} consecutive=${pressure.consecutiveUseTicks} recent=${formatNumber(
        pressure.recentUseIntensity,
      )} forage=${formatNumber(pressure.foragingPressure)} aquatic=${formatNumber(
        pressure.aquaticPressure,
      )} water=${formatNumber(pressure.waterPressure)} recovery=${formatNumber(
        pressure.recoveryProgress,
      )}`}
    />
  );
}

export function CausalTraceSummary({ trace }: { readonly trace: CausalTrace }) {
  return (
    <Detail
      label={`trace t${trace.tick}`}
      value={`${trace.kind} ${trace.sourceTileId ?? "n/a"} ${formatOptionalNumber(
        trace.fromValue,
      )}->${formatOptionalNumber(trace.toValue)}`}
    />
  );
}

export function IntentDetails({
  intent,
  historyCount,
}: {
  readonly intent: MobilityIntent | undefined;
  readonly historyCount: number;
}) {
  if (intent === undefined) {
    return (
      <>
        <div className="tile-detail-heading">Current intent</div>
        <Detail label="kind" value="none" />
        <Detail label="history" value={String(historyCount)} />
      </>
    );
  }

  return (
    <>
      <div className="tile-detail-heading">Current intent</div>
      <Detail label="kind" value={intent.kind} />
      <Detail label="reason" value={intent.reason.type} />
      <Detail label="confidence" value={formatNumber(intent.confidence)} />
      <Detail label="persistence" value={formatNumber(intent.persistence)} />
      <Detail label="horizon" value={`${intent.expectedHorizonTicks} ticks`} />
      <Detail
        label="target tile"
        value={intent.targetTileId === undefined ? "none" : String(intent.targetTileId)}
      />
      <Detail
        label="target region"
        value={intent.targetRegionId === undefined ? "none" : String(intent.targetRegionId)}
      />
      <Detail
        label="direction"
        value={intent.directionVector === undefined ? "none" : formatDirection(intent.directionVector)}
      />
      <Detail label="history" value={String(historyCount)} />
    </>
  );
}

export function KnowledgeDetails({ band }: { readonly band: Band }) {
  const knowledgeRecords = Object.values(band.knowledge.observedTiles);
  const personalCount = knowledgeRecords.filter(
    (record) => record.knowledgeSource === "personally_observed",
  ).length;
  // DEBUG-KNOWLEDGE-1: these two are FISSION-TIME provenance tags. observeTile() unconditionally
  // re-tags any re-observed tile as "personally_observed", so for a mature band they decay toward 0
  // as it re-walks its inherited range (and an ORIGINAL spawn band never had them) — that is why a
  // 400y band reads personally_observed ≈ known tiles. Fission-time counts live in the daughter
  // "Inheritance" section; this is the current LIVE count.
  const physicallySeenCount = knowledgeRecords.filter(
    (record) => record.knowledgeSource === "physically_seen_on_spawn",
  ).length;
  const inheritedMemoryCount = knowledgeRecords.filter(
    (record) => record.knowledgeSource === "inherited_memory",
  ).length;

  // DEBUG-KNOWLEDGE-1 — surface the LIVED systems built through M0.16–2K.11 (previously absent from
  // this panel, which made it look empty/stale). contactMemories is the REAL social memory (bands
  // actually ENCOUNTERED over life); knowledge.knownBands is only the spawn/parent SEED record (a
  // daughter seeds with just her parent → "known bands = 1", often long dead).
  const encounteredBands = Object.keys(band.contactMemories).length;
  const seedBandRecords = band.knowledge.knownBands.length;

  let inferredSide = 0;
  let inferredCorridor = 0;
  for (const rec of Object.values(band.frontierKnowledge?.inferredTiles ?? {})) {
    if (rec.source === "off_corridor_side_inference") {
      inferredSide += 1;
    } else {
      inferredCorridor += 1;
    }
  }

  const patchMemories = band.resourceKnowledgeState?.patchMemories ?? [];
  const sidePatchMemories = patchMemories.filter((memory) =>
    memory.reasonIds.some((reason) => String(reason).includes("side_country_probe")),
  ).length;
  const skillClasses = Object.keys(band.exploitationSkill?.skills ?? {}).length;
  const proactiveActions = band.proactiveInfoMemory?.cumulativeProactiveInfoActions ?? 0;
  const sideProbes = band.sideProbeMemory?.cumulativeSideProbes ?? 0;
  const opportunity = band.nearbyOpportunity;

  return (
    <>
      <div className="tile-detail-heading">Knowledge / Known Tiles</div>
      <Detail label="known tiles" value={String(Object.keys(band.knowledge.observedTiles).length)} />
      <Detail label="personally observed" value={String(personalCount)} />
      <Detail label="inherited memory (at fission; re-obs re-tags)" value={String(inheritedMemoryCount)} />
      <Detail label="physically seen on spawn (daughters)" value={String(physicallySeenCount)} />
      {/* Social memory: the lived contact count is the meaningful one; the seed record is shown for clarity. */}
      <Detail label="encountered bands (contact memory)" value={String(encounteredBands)} />
      <Detail label="seed band records (spawn/parent)" value={String(seedBandRecords)} />
      {/* Off-corridor / frontier knowledge (M0.16, frontierKnowledge.inferredTiles — existence only). */}
      <Detail label="inferred side tiles (off-corridor)" value={String(inferredSide)} />
      <Detail label="inferred corridor/frontier tiles" value={String(inferredCorridor)} />
      {/* Resource ecology learned through 2K.x (per-patch detail in the resource sections below). */}
      <Detail label="resource patch memories" value={String(patchMemories.length)} />
      <Detail label="· of which side-formed (2K.10)" value={String(sidePatchMemories)} />
      <Detail label="exploitation skill classes (2K.6)" value={String(skillClasses)} />
      <Detail label="proactive info actions (2K.6B)" value={String(proactiveActions)} />
      <Detail label="side probes won (M0.16B)" value={String(sideProbes)} />
      <Detail
        label="known-opportunity pull (2K.8)"
        value={
          opportunity === undefined || opportunity.bestKnownOpportunityTileId === undefined
            ? "none"
            : `${formatNumber(opportunity.opportunityStrength)} → ${String(opportunity.bestKnownOpportunityTileId)}`
        }
      />
      {/* Honest placeholders: these memory systems are TYPED but NOT yet implemented (always empty). */}
      <Detail
        label="inactive (not implemented yet)"
        value={`rumors ${band.knowledge.rumors.length} · known routes ${band.knowledge.knownRoutes.length} · route/rumor inheritance (RumorRecord / RouteMemory / inherited_rumor·inherited_route_hint tags — never written)`}
      />
    </>
  );
}

export function PlantPatchTruthDetails({
  currentTile,
  world,
}: {
  readonly currentTile: Tile | undefined;
  readonly world: WorldState | null;
}) {
  if (currentTile === undefined || world === null) {
    return null;
  }

  const patches = derivePlantPatchesForTile(currentTile, world.time)
    .map((patch) => summarizePlantPatchForDebug(patch, world.time.season));

  return (
    <>
      <div className="tile-detail-heading">Plant Patch Truth Debug</div>
      <Detail label="scope" value="ecological truth, not band-known; no yield/stress/move effect" />
      <Detail label="materialized" value={`${patches.length}/3 sparse lazy`} />
      {patches.length === 0 ? (
        <Detail label="patches" value="none materialized for this tile/season" />
      ) : (
        patches.slice(0, 3).map((patch, index) => (
          <Detail
            key={patch.patchId}
            label={`patch ${index + 1}`}
            value={`${patch.plantClassId} ${patch.currentAvailability} abundance=${formatNumber(
              patch.currentAbundance,
            )} visibility=${formatNumber(patch.visibility)} labor=${formatNumber(
              patch.laborCost,
            )} processing=${patch.processingNeed} safety=${patch.safetyRisk} fallback=${formatNumber(
              patch.fallbackRank,
            )}`}
          />
        ))
      )}
    </>
  );
}

export function DaughterInheritanceDetails({ band }: { readonly band: Band }) {
  const profile = band.inheritanceProfile;

  return (
    <>
      <div className="tile-detail-heading">Daughter Inheritance</div>
      {profile === undefined ? (
        <Detail label="inheritance" value="founder or not a daughter" />
      ) : (
        <>
          <Detail label="inherited known tiles" value={`${profile.inheritedKnownTileCount}/${profile.parentKnownTileCount}`} />
          <Detail label="spawn physical sight" value={String(profile.physicallySeenOnSpawnCount)} />
          <Detail label="personal known tiles" value={String(profile.personallyObservedTileCount)} />
          <Detail label="inherited memories" value={`${profile.inheritedMemoryCount}/${profile.parentMemoryCount}`} />
          <Detail label="inherited rumors" value={String(profile.inheritedRumorCount)} />
          <Detail label="inherited crossings" value={String(profile.inheritedCrossingCount)} />
          <Detail label="corridor hints" value={`${profile.inheritedCorridorHintCount}/${profile.parentCorridorCount}`} />
          <Detail label="route-hint tiles" value={String(profile.inheritedRouteHintTileCount)} />
          <Detail label="inherited share" value={formatNumber(profile.inheritedKnowledgeShare)} />
          <Detail label="avg inherited confidence" value={formatNumber(profile.averageInheritedConfidence)} />
        </>
      )}
    </>
  );
}

export function RangeFrontierOpportunityDetails({
  band,
  latestDecision,
}: {
  readonly band: Band;
  readonly latestDecision: Decision | undefined;
}) {
  const range = band.rangeSaturation;
  const frontier = band.frontierDispersal;
  const opportunity = band.nearbyOpportunity;
  const chosenScore = latestDecision?.alternativesConsidered[0]?.scoreBreakdown;

  return (
    <>
      <div className="tile-detail-heading">Range Saturation</div>
      {range === undefined ? (
        <Detail label="range state" value="not evaluated yet" />
      ) : (
        <>
          <Detail label="focal tile" value={String(range.focalTileId)} />
          <Detail label="local bands" value={String(range.localBandCount)} />
          <Detail label="local population" value={formatNumber(range.localPopulationEstimate)} />
          <Detail label="local use pressure" value={formatNumber(range.localUsePressure)} />
          <Detail label="nearby crowding" value={formatNumber(range.nearbyCrowding)} />
          <Detail label="effective suitability" value={formatNumber(range.effectiveHabitatSuitability)} />
          <Detail label="per capita return" value={formatNumber(range.perCapitaReturnEstimate)} />
          <Detail label="saturation pressure" value={formatNumber(range.saturationPressure)} />
        </>
      )}
      <div className="tile-detail-heading">Frontier / Opportunity</div>
      {frontier === undefined ? (
        <Detail label="frontier state" value="not evaluated yet" />
      ) : (
        <>
          <Detail label="dispersal pressure" value={formatNumber(frontier.pressure)} />
          <Detail label="preferred corridor" value={frontier.preferredCorridor} />
          <Detail label="best frontier" value={frontier.bestFrontierTileId === undefined ? "none" : String(frontier.bestFrontierTileId)} />
          <Detail label="frontier candidates" value={frontier.frontierCandidateTileIds.slice(0, 6).join(", ") || "none"} />
        </>
      )}
      {opportunity === undefined ? (
        <Detail label="known opportunity" value="not evaluated yet" />
      ) : (
        <>
          <Detail label="best known patch" value={opportunity.bestKnownOpportunityTileId === undefined ? "none" : String(opportunity.bestKnownOpportunityTileId)} />
          <Detail label="opportunity strength" value={formatNumber(opportunity.opportunityStrength)} />
          <Detail label="opportunity confidence" value={formatNumber(opportunity.opportunityConfidence)} />
          <Detail label="passability confidence" value={formatNumber(opportunity.passabilityConfidence)} />
          <Detail label="opportunity candidates" value={String(opportunity.knownCandidateCount)} />
        </>
      )}
      <Detail
        label="latest frontier score"
        value={
          chosenScore === undefined
            ? "no scored decision yet"
            : `sat=${formatNumber(chosenScore.rangeSaturation)} cap=${formatNumber(
                chosenScore.perCapitaReturn,
              )} frontier=${formatNumber(chosenScore.frontierDispersalPressure)} opp=${formatNumber(
                chosenScore.knownOpportunityPull,
              )} baseline=${formatNumber(chosenScore.explorationBaseline)}`
        }
      />
    </>
  );
}

export function DryMarginDetails({
  band,
  latestDecision,
}: {
  readonly band: Band;
  readonly latestDecision: Decision | undefined;
}) {
  const context = band.dryMarginContext;
  const chosenScore = latestDecision?.alternativesConsidered[0]?.scoreBreakdown;

  if (context === undefined) {
    return (
      <>
        <div className="tile-detail-heading">Dry-Margin Water / Probes</div>
        <Detail label="state" value="not a dry-margin context" />
      </>
    );
  }

  const water = context.currentWaterRefuge;
  const seasonalMode = context.seasonalMode;
  const prospect = context.riverProspect;
  const comparison = context.stayMoveScout;

  return (
    <>
      <div className="tile-detail-heading">Dry-Margin Water / Probes</div>
      <Detail label="place assessment" value={context.currentPlaceAssessment} />
      {water === undefined ? (
        <Detail label="current water" value="unknown" />
      ) : (
        <>
          <Detail label="water source" value={water.sourceKind} />
          <Detail label="water reliability" value={formatNumber(water.reliability)} />
          <Detail label="dry reliability" value={formatNumber(water.drySeasonReliability)} />
          <Detail label="wet reliability" value={formatNumber(water.wetSeasonReliability)} />
          <Detail label="drought failure risk" value={formatNumber(water.droughtFailureRisk)} />
          <Detail label="fallback rank" value={String(water.fallbackRank)} />
        </>
      )}
      {seasonalMode === undefined ? (
        <Detail label="seasonal mode" value="not evaluated" />
      ) : (
        <>
          <Detail label="seasonal mode" value={seasonalMode.mode} />
          <Detail label="water contraction" value={formatNumber(seasonalMode.waterContraction)} />
          <Detail label="temporary water" value={formatNumber(seasonalMode.temporaryWaterOpportunity)} />
          <Detail label="dry refuge pull" value={formatNumber(seasonalMode.dryRefugePull)} />
          <Detail label="drought severity" value={formatNumber(seasonalMode.droughtSeverity)} />
        </>
      )}
      {prospect === undefined ? (
        <Detail label="river prospect" value="none" />
      ) : (
        <>
          <Detail label="prospect direction" value={prospect.corridorDirection} />
          <Detail label="best prospect" value={prospect.bestProspectTileId === undefined ? "none" : String(prospect.bestProspectTileId)} />
          <Detail label="prospect strength" value={formatNumber(prospect.prospectStrength)} />
          <Detail label="expected water" value={formatNumber(prospect.expectedWater)} />
          <Detail label="expected food" value={formatNumber(prospect.expectedFood)} />
          <Detail label="uncertainty" value={formatNumber(prospect.uncertainty)} />
          <Detail label="prospect basis" value={prospect.basis.join(", ")} />
        </>
      )}
      {comparison === undefined ? (
        <Detail label="stay/move/scout" value="not evaluated" />
      ) : (
        <>
          <Detail label="stay value" value={formatNumber(comparison.stayValue)} />
          <Detail label="scout value" value={formatNumber(comparison.scoutValue)} />
          <Detail label="move value" value={formatNumber(comparison.moveValue)} />
          <Detail label="marginal return" value={formatNumber(comparison.currentMarginalReturn)} />
          <Detail label="departure threshold" value={formatNumber(comparison.departureThreshold)} />
          <Detail label="fallback loss" value={formatNumber(comparison.lossOfFallbackSecurity)} />
        </>
      )}
      <Detail
        label="logistical probe"
        value={`${context.logisticalProbeAvailable ? "available" : "unavailable"} / ${
          latestDecision?.action.type === "logistical_probe" || context.logisticalProbeSelected ? "selected" : "not selected"
        }`}
      />
      <Detail
        label="latest dry score"
        value={
          chosenScore === undefined
            ? "no scored decision yet"
            : `refuge=${formatNumber(chosenScore.waterRefugeSecurity)} scout=${formatNumber(
                chosenScore.scoutValue,
              )} move=${formatNumber(chosenScore.moveValue)} prospect=${formatNumber(
                chosenScore.riverProspectStrength,
              )} social=${formatNumber(chosenScore.socialAccessRisk)}`
        }
      />
    </>
  );
}

export function ResidentialAnchorDetails({ band }: { readonly band: Band }) {
  const anchor = band.residentialAnchor;
  const preAnchor = band.preDecisionAnchor;
  const decision = band.anchorDecision;
  const trace = band.anchorActionTrace;
  const activity = band.intraSeasonActivity;
  const radius = band.foragingRadiusState;
  const memories = band.anchorMemories;
  const memoryHere = memories?.[band.position];

  if (anchor === undefined) {
    return (
      <>
        <div className="tile-detail-heading">Residential Anchor / Catchment</div>
        <Detail label="state" value="no anchor (not water-tethered)" />
      </>
    );
  }

  return (
    <>
      <div className="tile-detail-heading">Residential Anchor / Catchment (post-decision)</div>
      <Detail label="anchor tile" value={String(anchor.anchorTileId)} />
      <Detail
        label="tethering water"
        value={anchor.tetheringWaterTileId === undefined ? "none" : String(anchor.tetheringWaterTileId)}
      />
      <Detail label="anchor status" value={anchor.anchorStatus} />
      <Detail label="drought response" value={anchor.droughtResponse} />
      <Detail label="seasons anchored" value={String(anchor.seasonsAnchored)} />
      <Detail
        label="foraging radius"
        value={`${anchor.foragingRadius} (${radius?.basis ?? "?"}, log ${anchor.logisticalRadius})`}
      />
      <Detail label="catchment tiles" value={String(anchor.catchmentTileIds.length)} />
      <Detail label="catchment return" value={formatNumber(anchor.catchmentReturnEstimate)} />
      <Detail label="catchment depletion" value={formatNumber(anchor.catchmentDepletion)} />
      <Detail label="anchor water security" value={formatNumber(anchor.anchorWaterSecurity)} />
      <Detail label="dependency load" value={formatNumber(anchor.dependencyLoad)} />
      <Detail label="logistical capacity" value={formatNumber(anchor.logisticalCapacity)} />
      {decision === undefined ? null : (
        <>
          <div className="tile-detail-heading">Anchor Decision (scored pre-decision)</div>
          <Detail
            label="hold / foray / relocate"
            value={`${formatNumber(decision.holdValue)} / ${formatNumber(decision.forayValue)} / ${formatNumber(decision.relocateValue)}`}
          />
          <Detail label="chosen residence" value={decision.chosenResidentialAction} />
          <Detail label="relocation hysteresis" value={formatNumber(decision.relocationHysteresis)} />
          <Detail
            label="anchor return vs alt"
            value={`${formatNumber(decision.anchorMarginalReturn)} vs ${formatNumber(decision.bestKnownAlternativeNet)}`}
          />
        </>
      )}
      {trace === undefined ? null : (
        <Detail
          label="anchor → final action"
          value={`recommended ${trace.anchorRecommendation} → ${trace.finalAction} (residence ${
            trace.residenceMoved ? "moved" : "held"
          })${trace.overrodeAnchor ? ` — OVERRIDE: ${trace.overrideReason ?? "movement_overrode_anchor_recommendation"}` : ""}`}
        />
      )}
      {preAnchor === undefined ? null : (
        <Detail
          label="pre-decision anchor (relocated)"
          value={`${String(preAnchor.anchorTileId)} hold=${formatNumber(preAnchor.holdValue)} status=${preAnchor.anchorStatus}`}
        />
      )}
      {activity === undefined ? null : (
        <>
          <Detail label="residence mode" value={activity.residenceMode} />
          <Detail label="residence moved" value={activity.residenceMoved ? "yes" : "no"} />
          <Detail
            label="activity (near/far/scout/rest)"
            value={`${formatNumber(activity.activityBudget.nearAnchorForaging)} / ${formatNumber(
              activity.activityBudget.farLogisticalForays,
            )} / ${formatNumber(activity.activityBudget.scoutingProbes)} / ${formatNumber(activity.activityBudget.restRecovery)}`}
          />
        </>
      )}
      {memories === undefined ? null : (
        <>
          <div className="tile-detail-heading">Anchor Memory (revisitation)</div>
          <Detail label="remembered anchors" value={String(Object.keys(memories).length)} />
          {memoryHere === undefined ? (
            <Detail label="this tile" value="no prior anchor memory" />
          ) : (
            <Detail
              label="this tile"
              value={`held ${memoryHere.anchoredSeasonCount} (ok ${memoryHere.successfulHoldCount}/fail ${memoryHere.failedHoldCount}) reliab=${formatNumber(
                memoryHere.drySeasonReliability,
              )} conf=${formatNumber(memoryHere.confidence)}`}
            />
          )}
        </>
      )}
    </>
  );
}

export function DailyTaskGroupDetails({
  trips,
  selectedActivityTripId,
}: {
  readonly trips: readonly IntraSeasonTripRecord[];
  readonly selectedActivityTripId: string | null;
}) {
  if (trips.length === 0) {
    return (
      <>
        <div className="tile-detail-heading">Daily Activity</div>
        <Detail label="recent records" value="none" />
        <Detail label="status" value="no task-group records yet" />
      </>
    );
  }

  const recent = [...trips].sort((left, right) => Number(right.day) - Number(left.day)).slice(0, 6);
  const latest = recent[0];
  const selectedTrip =
    selectedActivityTripId === null
      ? undefined
      : trips.find((trip) => getActivityTripId(trip) === selectedActivityTripId);
  const taskCounts = countBy(recent, (trip) => trip.taskGroupType);
  const objectiveCounts = countBy(recent, (trip) => trip.objective);

  return (
    <>
      <div className="tile-detail-heading">Daily Activity</div>
      {selectedTrip === undefined ? null : (
        <>
          <Detail label="selected group" value={`${selectedTrip.groupLabel} (${selectedTrip.taskGroupType})`} />
          <Detail label="selected people" value={`${selectedTrip.estimatedPeopleCount} people est.`} />
          <Detail label="selected objective" value={`${selectedTrip.objectiveLabel} (${selectedTrip.objective})`} />
          <Detail label="selected cause" value={`${selectedTrip.cause}; reasons ${formatReasonIds(selectedTrip.reasonIds)}`} />
          <Detail
            label="selected schedule"
            value={`start d${getDayOfSeason(selectedTrip.startDay)}, end d${getDayOfSeason(
              selectedTrip.endDay,
            )}, duration ${selectedTrip.estimatedDurationDays}d`}
          />
          <Detail label="selected target" value={String(selectedTrip.targetTileId)} />
          <Detail
            label="selected route"
            value={`${selectedTrip.distanceTiles} out, ${selectedTrip.roundTripTiles} round, ${selectedTrip.tilesCrossed} crossed`}
          />
          <Detail label="selected status" value={formatActivityTripStatus(selectedTrip)} />
          <Detail
            label="selected outcome"
            value={`${selectedTrip.activityOutcome}; ${formatReasonIds(selectedTrip.activityOutcomeReasonIds)}`}
          />
          <Detail label="selected result" value={selectedTrip.resultSummary} />
          <Detail label="selected memory" value={formatActivityMemoryEffect(selectedTrip.activityMemoryEffect)} />
          <Detail label="selected return" value={formatActivityReturn(selectedTrip)} />
          <Detail label="selected shadow" value={formatActivityShadow(selectedTrip)} />
          <Detail label="selected reliability" value={formatNumber(selectedTrip.shadowSubsistence.shadowReliability)} />
          <Detail label="selected seasonal" value={formatSeasonalEcology(selectedTrip)} />
          <Detail
            label="selected guard"
            value="debug/partial model; not full economy unless AG11+ flag enables it."
          />
        </>
      )}
      <Detail label="latest group" value={`${latest.groupLabel} (${latest.estimatedPeopleCount} people est.)`} />
      <Detail label="latest objective" value={latest.objectiveLabel} />
      <Detail label="latest cause" value={`${latest.cause}, day ${getDayOfSeason(latest.day)} ${latest.season}`} />
      <Detail label="latest target" value={String(latest.targetTileId)} />
      <Detail
        label="latest distance"
        value={`${latest.distanceTiles} out, ${latest.roundTripTiles} round, ${latest.estimatedDurationDays}d, ${latest.outcome}`}
      />
      <Detail
        label="latest result"
        value={`${latest.activityOutcome}, ${latest.activityStatus}, d${getDayOfSeason(latest.startDay)}-d${getDayOfSeason(latest.endDay)}`}
      />
      <Detail label="latest reason" value={latest.activityOutcomeSummary} />
      <Detail
        label="latest return"
        value={`${latest.resourceReturn.returnedResourceKind}; value=${formatNumber(
          latest.resourceReturn.estimatedReturnValue,
        )}; conf=${formatNumber(latest.resourceReturn.returnConfidence)}; consumed=no`}
      />
      <Detail label="latest seasonal" value={formatSeasonalEcology(latest)} />
      <Detail label="latest guard" value={formatTripGuard(latest)} />
      <Detail label="recent types" value={formatCounts(taskCounts)} />
      <Detail label="recent objectives" value={formatCounts(objectiveCounts)} />
      <Detail
        label="recent range"
        value={`${recent.length}/${trips.length} shown, max one-way ${Math.max(...recent.map((trip) => trip.distanceTiles))} tiles, no effect: ${
          recent.every((trip) => trip.noResidentialRelocation && trip.noYieldChange && trip.noStressChange)
            ? "yes"
            : "no"
        }`}
      />
      {recent.slice(1, 4).map((trip) => (
        <Detail
          key={`${String(trip.sourceBandId)}:${Number(trip.day)}:${String(trip.targetTileId)}:${trip.cause}`}
          label={`trip d${getDayOfSeason(trip.day)}`}
          value={formatActivityTrip(trip)}
        />
      ))}
    </>
  );
}

export function ActivityOutcomeDetails({
  band,
}: {
  readonly band: Band;
}) {
  const summary = band.activityOutcomeSummary;

  if (summary === undefined) {
    return (
      <>
        <div className="tile-detail-heading">Activity Outcomes / Returns</div>
        <Detail label="summary" value="no outcome scaffold records yet" />
        <Detail label="guard" value="record-only; not feeding economy yet" />
      </>
    );
  }

  return (
    <>
      <div className="tile-detail-heading">Activity Outcomes / Returns</div>
      <Detail
        label="counts"
        value={`success ${summary.successCount}, partial ${summary.partialCount}, failed ${summary.failedCount}, info ${summary.informationCount}, no-effect ${summary.noEffectCount}`}
      />
      <Detail label="outcomes" value={formatActivityOutcomes(summary.outcomesByType)} />
      <Detail label="returns" value={formatActivityReturns(summary.returnsByResourceKind)} />
      <Detail label="max placeholder value" value={formatNumber(summary.maxEstimatedReturnValue)} />
      <Detail label="guard" value={formatOutcomeGuard(summary)} />
    </>
  );
}

export function ActivityMemoryEffectsDetails({
  band,
}: {
  readonly band: Band;
}) {
  const summary = band.activityMemoryUpdateSummary;

  if (summary === undefined) {
    return (
      <>
        <div className="tile-detail-heading">Activity Memory Effects</div>
        <Detail label="summary" value="no activity-memory effects yet" />
        <Detail label="guard" value="memory only; not food/yield economy" />
      </>
    );
  }

  const latest = summary.latestMemoryEffect;

  return (
    <>
      <div className="tile-detail-heading">Activity Memory Effects</div>
      <Detail
        label="latest effect"
        value={latest === undefined ? "none" : formatActivityMemoryEffect(latest)}
      />
      <Detail label="effects" value={formatActivityMemoryEffectCounts(summary.effectCounts)} />
      <Detail
        label="touched / delta"
        value={`${summary.touchedMemoryCount} memories; delta ${formatNumber(summary.minConfidenceDelta)}..${formatNumber(
          summary.maxConfidenceDelta,
        )}; total +${formatNumber(summary.confidenceIncreaseTotal)} / ${formatNumber(summary.confidenceDecreaseTotal)}`}
      />
      <Detail label="guard" value={formatActivityMemoryGuard(summary)} />
      {summary.recentMemoryEffects.slice(1, 4).map((effect) => (
        <Detail
          key={`${String(effect.sourceBandId)}:${Number(effect.sourceTripDay)}:${String(effect.targetTileId)}:${effect.effectType}`}
          label={`memory d${getDayOfSeason(effect.sourceTripDay)}`}
          value={formatActivityMemoryEffect(effect)}
        />
      ))}
    </>
  );
}

// ECO-SEASON-1 + 2K.12 — learned seasonal ecology for the selected band. Inspection only.
// Shows whether the 2K.12 memory READERS are ON/OFF, what learned seasonal hint would
// currently influence a target (selection-only bias), and the guard line: learned memory
// only, no hidden seasonal truth, no direct economy mutation.
export function SeasonalEcologyDetails({
  band,
  world,
}: {
  readonly band: Band;
  readonly world: WorldState | null;
}) {
  const memory = band.seasonalEcologyMemory ?? {};
  const observations = Object.values(memory) as readonly SeasonalEcologyObservation[];
  const latestTripEcology = band.lastIntraSeasonTrip?.seasonalEcology;
  const readersEnabled = world?.auditOptions?.seasonalEcologyMemoryReadersEnabled === true;
  const season = world?.time.season;
  const recent = [...observations]
    .sort((left, right) => Number(right.lastObservedTick) - Number(left.lastObservedTick))
    .slice(0, 4);
  // 2K.12: the learned hints that would bias a known target THIS season (readers ON only).
  const liveHints =
    readersEnabled && season !== undefined
      ? recent
          .map((observation) => ({ observation, hint: readSeasonalEcologyHint(memory, observation.tileId, season) }))
          .filter((entry): entry is { observation: SeasonalEcologyObservation; hint: NonNullable<typeof entry.hint> } => entry.hint !== undefined)
      : [];

  return (
    <>
      <div className="tile-detail-heading">Seasonal Ecology (ECO-SEASON-1 / 2K.12)</div>
      <Detail
        label="memory readers"
        value={readersEnabled ? "ON (2K.12 — selection-only target bias)" : "OFF (default — no behaviour change)"}
      />
      <Detail label="learned tiles" value={String(observations.length)} />
      <Detail
        label="latest observation"
        value={latestTripEcology === undefined ? "none yet" : formatSeasonalEcology(band.lastIntraSeasonTrip as IntraSeasonTripRecord)}
      />
      {recent.length === 0 ? (
        <Detail label="seasonal hints" value="none yet — learned only by visiting" />
      ) : (
        recent.map((observation) => (
          <Detail
            key={String(observation.tileId)}
            label={`hint ${String(observation.tileId)}`}
            value={formatSeasonalEcologyObservation(observation)}
          />
        ))
      )}
      {readersEnabled &&
        (liveHints.length === 0 ? (
          <Detail label="active influence" value={season === undefined ? "—" : `none this season (${season})`} />
        ) : (
          liveHints.map(({ observation, hint }) => (
            <Detail
              key={`influence-${String(observation.tileId)}`}
              label={`influence ${String(observation.tileId)}`}
              value={`${hint.kind} bias=${formatNumber(hint.bias)} — ${String(hint.reasonId)}`}
            />
          ))
        ))}
      <Detail
        label="guard"
        value="learned memory only — no hidden seasonal truth; reader bias is selection-only (±0.12), no direct support/yield/carrying-capacity mutation"
      />
    </>
  );
}

export function FamiliarCountryDetails({
  band,
  world,
}: {
  readonly band: Band;
  readonly world: WorldState | null;
}) {
  const currentTick = world?.time.tick ?? (0 as TickNumber);
  const range = deriveFamiliarCountry(band, currentTick);
  const context = classifyMovementContext(band, range, currentTick);
  const { core, familiar, edge, rangeTotal, observedTotal } = range.counts;
  const { campCore, waterCore, routeCorridorTiles, activityZoneTiles } = range.corePlaces;

  return (
    <>
      <div className="tile-detail-heading">Familiar Country (RANGE-1)</div>
      <Detail label="movement context" value={context} />
      <Detail
        label="range tiles"
        value={`core ${core} · familiar ${familiar} · edge ${edge} — range ${rangeTotal}/${observedTotal} observed`}
      />
      <Detail label="camp core" value={campCore === undefined ? "—" : String(campCore)} />
      <Detail label="water core" value={waterCore === undefined ? "—" : String(waterCore)} />
      <Detail label="route corridor tiles" value={String(routeCorridorTiles.length)} />
      <Detail label="activity zone tiles" value={String(activityZoneTiles.length)} />
      <Detail label="meaningful range" value={range.hasMeaningfulRange ? "yes" : "no (new / unsettled band)"} />
      <Detail
        label="guard"
        value="derived from this band's known memory only — not territory, borders, or ownership; no hidden map data, no economy effect"
      />
    </>
  );
}

export function LineageInheritedRangeDetails({
  band,
  world,
}: {
  readonly band: Band;
  readonly world: WorldState | null;
}) {
  const currentTick = world?.time.tick ?? (0 as TickNumber);
  const parent = band.parentBandId !== undefined && world !== null ? world.bands[band.parentBandId] : undefined;
  const ctx = deriveInheritedRangeContext(band, parent, currentTick);
  const swatch = (color: string) => ({
    display: "inline-block",
    width: "12px",
    height: "12px",
    borderRadius: "var(--radius-sm)",
    marginRight: "4px",
    background: color,
    verticalAlign: "middle",
  });

  return (
    <>
      <div className="tile-detail-heading">Lineage &amp; inherited range (RANGE-2)</div>
      <Detail label="parent band" value={band.parentBandId === undefined ? "founder — no parent" : String(band.parentBandId)} />
      <div className="lineage-color-relation">
        {parent !== undefined ? <span style={swatch(parent.color)} aria-hidden /> : null}
        <span style={swatch(band.color)} aria-hidden />
        <span>{parent === undefined ? "founder colour" : "child colour (related to parent)"}</span>
      </div>
      <Detail label="relation to parent range" value={ctx.relation} />
      <Detail
        label="daughter range tiles"
        value={`core ${ctx.daughterRange.counts.core} · familiar ${ctx.daughterRange.counts.familiar} · edge ${ctx.daughterRange.counts.edge}`}
      />
      <Detail label="shared with parent range" value={`${ctx.sharedRangeTileCount} tiles`} />
      <Detail label="parent range tiles" value={ctx.parentRangeCounts === undefined ? "—" : String(ctx.parentRangeCounts.rangeTotal)} />
      <Detail
        label="guard"
        value="proto-range / familiar country inherited from lineage — not official territory, borders, or ownership; derived from this band's own memory; no hidden data, no economy effect"
      />
    </>
  );
}

export function KnownNeighbouringRangesDetails({
  band,
  world,
}: {
  readonly band: Band;
  readonly world: WorldState | null;
}) {
  const currentTick = world?.time.tick ?? (0 as TickNumber);

  if (world === null) {
    return (
      <>
        <div className="tile-detail-heading">Known neighbouring ranges (RANGE-3)</div>
        <Detail label="status" value="no known neighbouring ranges yet" />
      </>
    );
  }

  const { neighbors, counts } = deriveSocialRangeRecognition(band, world, currentTick);

  const swatch = (color: string) => ({
    display: "inline-block",
    width: "12px",
    height: "12px",
    borderRadius: "var(--radius-sm)",
    marginRight: "4px",
    background: color,
    verticalAlign: "middle",
  });

  return (
    <>
      <div className="tile-detail-heading">Known neighbouring ranges (RANGE-3)</div>
      <Detail label="counts" value={`total ${counts.total} · kin ${counts.kin} · neighbor ${counts.neighbor}`} />
      {neighbors.length === 0 ? (
        <Detail label="status" value="no known neighbouring ranges yet" />
      ) : (
        neighbors.map((n) => {
          const targetBand = world.bands[n.targetBandId];
          const displayName = targetBand?.name ?? String(n.targetBandId);
          const swatchColor = targetBand?.color ?? "#888";
          const evidenceAge =
            n.lastEvidenceTick !== undefined
              ? `${Number(currentTick) - Number(n.lastEvidenceTick)} ticks ago`
              : "no evidence tick";
          return (
            <div key={n.targetBandId} style={{ marginBottom: "4px" }}>
              <span style={swatch(swatchColor)} aria-hidden />
              <Detail
                label={displayName}
                value={`${n.relationKind} · ${n.awarenessLevel} · ${n.rangeRelation} · shared range ${n.sharedRangeTileCount} / water ${n.sharedWaterCoreCount} · last evidence ${evidenceAge}`}
              />
            </div>
          );
        })
      )}
      <Detail
        label="guard"
        value="familiar country / social recognition only — derived from this band's own memory; not borders, ownership, recognition-as-law, or war."
      />
    </>
  );
}

export function ReportedKnowledgeDetails({
  band,
  world,
}: {
  readonly band: Band;
  readonly world: WorldState | null;
}) {
  const state = band.reportedKnowledge;
  const reports = state?.reports ?? [];
  const speculations = state?.speculations ?? [];

  return (
    <>
      <div className="tile-detail-heading">Reports / shared knowledge</div>
      {state === undefined || (reports.length === 0 && speculations.length === 0) ? (
        <Detail label="status" value="no reports, internal talk, or regional speculation remembered yet" />
      ) : (
        <>
          <Detail
            label="counts"
            value={`remembered ${reports.length} · internal ${state.internalGeneratedCount ?? 0} · inter-band ${state.interBandGeneratedCount ?? 0} · checked ${state.checkedByProbeCount} · partial ${state.partiallyConfirmedCount ?? 0} · contradicted ${state.contradictedCount ?? 0} · stale ${state.staleCount ?? 0} · faded/expired ${state.expiredOrFadedCount ?? 0} · merged ${state.mergedSimilarCount ?? 0} · speculations ${speculations.length}`}
          />
          {reports.map((report) => (
            <Detail
              key={report.reportId}
              label={formatReportLabel(report, world)}
              value={formatReportValue(report, band)}
            />
          ))}
          {speculations.map((speculation) => (
            <Detail
              key={speculation.speculationId}
              label={`speculation: ${formatSpeculationHypothesis(speculation.hypothesis)}`}
              value={`${formatReportRegion(speculation.regionTarget)} · conf ${formatNumber(speculation.confidence)} · evidence ${speculation.evidenceCount} · contradictions ${speculation.contradictionCount} · ${speculation.receiverDisposition}`}
            />
          ))}
        </>
      )}
      <Detail
        label="guard"
        value="second-hand, uncertain, bounded reports only — no map reveal, no direct resource unlock, no direct relocation."
      />
    </>
  );
}

// PERCEPTION-MOBILITY-1B — 1 tile = 1.5 km (the documented map scale). Visibility
// reaches VISIBILITY_RADIUS_TILES (10) from camp.
const KM_PER_TILE = 1.5;
const VISIBILITY_RADIUS_TILES = 10;

function cueClarity(cue: { readonly blockedByTerrain: boolean; readonly confidence: number }): string {
  if (cue.blockedByTerrain) {
    return "blocked";
  }

  return cue.confidence >= 0.5 ? "clear" : "partial";
}

function cueStatusLabel(status: string): string {
  switch (status) {
    case "unchecked": return "visible but unchecked";
    case "partly_checked": return "seen, partly checked";
    case "scouted": return "scouted";
    case "stale": return "remembered (stale)";
    default: return status;
  }
}

export function VisibleLandscapeDetails({
  band,
}: {
  readonly band: Band;
}) {
  const cues = band.visibleLandscapeCues ?? [];
  const influencedCount = cues.reduce((sum, cue) => sum + cue.influencedScoutOrProbeCount, 0);
  // Did any recent residential move act on a cue-style opportunity? (cue → scout →
  // memory → known-opportunity relocation). Shown as the cue→movement bridge.
  const residentialFromOpportunity = (band.recentResidentialMoveEvents ?? []).filter(
    (move) => move.cause === "known_opportunity" || move.cause === "frontier_intent",
  ).length;

  return (
    <>
      <div className="tile-detail-heading">What this band can see (visibility)</div>
      <Detail label="viewpoint / camp tile" value={String(band.position)} />
      <Detail
        label="visibility range"
        value={`${VISIBILITY_RADIUS_TILES} tiles · ~${formatNumber(VISIBILITY_RADIUS_TILES * KM_PER_TILE)} km (1 tile = ${KM_PER_TILE} km)`}
      />
      {cues.length === 0 ? (
        <Detail label="cues" value="no distant visible cues currently remembered" />
      ) : (
        <>
          <Detail
            label="cues"
            value={`${cues.length} active · ${influencedCount} influenced a scout/probe · ${residentialFromOpportunity} opportunity-led camp move(s)`}
          />
          {cues.slice(0, 6).map((cue) => (
            <Detail
              key={cue.cueId}
              label={`${cue.kind} ${cue.direction}`}
              value={`${cue.distanceTiles} tiles (~${formatNumber(cue.distanceTiles * KM_PER_TILE)} km) · ${cueClarity(cue)} · conf ${formatNumber(cue.confidence)} · ${cueStatusLabel(cue.status)} · scout/probe interest ${cue.influencedScoutOrProbeCount}`}
            />
          ))}
        </>
      )}
      <Detail
        label="guard"
        value="visible cues are approximate and uncertain — they can encourage scouting/probing but do NOT create observed tiles, resource knowledge, support, or relocation. No exact hidden resources are revealed."
      />
    </>
  );
}

// PERCEPTION-MOBILITY-1B — activity (task-group) trips. These are hunters /
// fishers / gatherers / scouts leaving the camp; they are SEPARATE from slow
// whole-band residential movement and can range farther/faster.
function activityTypeLabel(taskGroupType: string): string {
  switch (taskGroupType) {
    case "hunting_group": return "hunters";
    case "fishing_group": return "fishers";
    case "plant_gathering_group": return "gatherers";
    case "local_foraging_group": return "foragers";
    case "water_group": return "water check";
    case "plant_followup_group": return "plant scouts";
    case "memory_refresh_group": return "route/memory scouts";
    default: return taskGroupType;
  }
}

function seasonalActivityReason(trip: IntraSeasonTripRecord): string {
  if (trip.seasonalEcology?.shadowSeasonalResult === "boosted") {
    return "season boosted expected return";
  }

  if (trip.seasonalEcology?.shadowSeasonalResult === "reduced") {
    return "season reduced expected return";
  }

  if (trip.activityOutcome === "failed_due_to_season_mismatch") {
    return "rejected/failed from season mismatch";
  }

  if (trip.taskGroupType === "water_group") {
    return "water urgency check";
  }

  if (trip.taskGroupType === "memory_refresh_group") {
    return "route/memory refresh";
  }

  return "season did not materially change activity";
}

export function ActivityTraceDetails({ band }: { readonly band: Band }) {
  const trips = (band.recentIntraSeasonTrips ?? []).slice(0, 6);

  return (
    <>
      <div className="tile-detail-heading">Activity trips — task groups leaving camp (separate from whole-band moves)</div>
      {trips.length === 0 ? (
        <Detail label="status" value="no recent activity trips" />
      ) : (
        trips.map((trip, index) => (
          <Detail
            key={`${String(trip.tick)}:${index}`}
            label={`${activityTypeLabel(trip.taskGroupType)} → ${String(trip.targetTileId)}`}
            value={`${trip.season} · ${seasonalActivityReason(trip)} · ${trip.distanceTiles} tiles (~${formatNumber(
              trip.distanceTiles * KM_PER_TILE,
            )} km) · ${trip.activityOutcome} · food urgency ${formatNumber(
              band.pressureState?.foodStress ?? 0,
            )} · water urgency ${formatNumber(
              band.pressureState?.waterStress ?? 0,
            )} · expected return ${formatNumber(
              trip.resourceReturn.estimatedReturnValue,
            )}${formatPlantPatchTrace(trip)}${formatAquaticActivityTrace(trip)} · memory: ${trip.activityMemoryEffect.effectType}`}
          />
        ))
      )}
      <Detail
        label="basis"
        value="activity targets are band-known / cued only; trips are faster and can range farther than the whole camp, never teleport, and never read hidden resources."
      />
    </>
  );
}

function formatPlantPatchTrace(trip: IntraSeasonTripRecord): string {
  const trace = trip.plantPatchTrace;
  if (trace === undefined) {
    return "";
  }

  return ` · plant ${trace.plantClassId}/${trace.seasonalAvailability} return ${formatNumber(trace.expectedReturnFactor)} depletion ${formatNumber(trace.currentDepletion)} fallback ${trace.fallbackRole} labor ${formatNumber(trace.laborCost)} risk ${trace.safetyRisk} update ${trace.knowledgeUpdate}`;
}

function formatAquaticActivityTrace(trip: IntraSeasonTripRecord): string {
  const trace = trip.aquaticActivityTrace;
  if (trace === undefined) {
    return "";
  }

  return ` · aquatic ${trace.aquaticKind}/${trace.waterContext} stock ${trace.stockId} return ${formatNumber(trace.expectedReturnFactor)} availability ${formatNumber(trace.seasonalAvailability)} pressure ${formatNumber(trace.pressure)} recovery ${formatNumber(trace.recoveryRate)} depletionApplied ${trace.depletionApplied} update ${trace.knowledgeUpdate}`;
}

export function ResidentialMoveTraceDetails({ band }: { readonly band: Band }) {
  const moves = (band.recentResidentialMoveEvents ?? []).slice(0, 6);
  const arrived = moves.filter((move) => move.status === "arrived").length;
  const blocked = moves.filter((move) => move.status === "failed_no_route" || move.status === "delayed_placeholder").length;

  return (
    <>
      <div className="tile-detail-heading">Whole-band (residential) moves — accepted / delayed / why</div>
      {moves.length === 0 ? (
        <Detail label="status" value="no recent residential moves recorded — the camp is holding its ground" />
      ) : (
        <>
          <Detail label="recent" value={`${moves.length} events · ${arrived} arrived · ${blocked} delayed/blocked`} />
          {moves.map((move) => (
            <Detail
              key={String(move.eventId)}
              label={`${move.moveKind} · ${move.cause}`}
              value={`${move.status} · ${move.distanceTiles} tiles (~${formatNumber(
                move.distanceTiles * KM_PER_TILE,
              )} km) · hardship ${move.hardshipLevel ?? "n/a"} ${formatNumber(
                move.hardshipRisk ?? 0,
              )} (${move.hardshipOutcome ?? "accepted"}: ${move.hardshipReason ?? "not evaluated"}) · conf ${formatNumber(
                move.confidence,
              )} · ${String(move.fromTileId)} → ${String(move.toTileId)}${move.temporaryWatercraft === undefined ? "" : ` · watercraft ${move.temporaryWatercraft.traceType}/${move.temporaryWatercraft.result}/${move.temporaryWatercraft.watercraftType ?? "none"} material ${formatNumber(move.temporaryWatercraft.materialConfidence)} safety ${formatNumber(move.temporaryWatercraft.expectedCrossingSafety)} risk ${formatNumber(move.temporaryWatercraft.riverRisk)} shuttles ${move.temporaryWatercraft.shuttleTrips} load ${move.temporaryWatercraft.carryBurden} basis ${move.temporaryWatercraft.materialBasis.join(";") || "none"}`}`}
            />
          ))}
        </>
      )}
    </>
  );
}

export function RangeFrictionDetails({
  band,
  world,
}: {
  readonly band: Band;
  readonly world: WorldState | null;
}) {
  const events = band.recentRangeFrictionEvents ?? [];
  const byTension = events.reduce<Record<string, number>>((counts, event) => {
    counts[event.tensionLevel] = (counts[event.tensionLevel] ?? 0) + 1;
    return counts;
  }, {});

  return (
    <>
      <div className="tile-detail-heading">Recent shared-use / tension notices (RANGE-4)</div>
      {events.length === 0 ? (
        <Detail label="status" value="no recent shared-use or tension notices" />
      ) : (
        <>
          <Detail
            label="counts"
            value={`recent ${events.length} · ${Object.entries(byTension)
              .sort(([left], [right]) => left.localeCompare(right))
              .map(([tension, count]) => `${formatRangeFrictionTerm(tension)} ${count}`)
              .join(" · ")}`}
          />
          {events.slice(0, 8).map((event) => (
            <Detail
              key={event.eventId}
              label={formatRangeFrictionLabel(event, world)}
              value={formatRangeFrictionValue(event)}
            />
          ))}
        </>
      )}
      <Detail
        label="guard"
        value="record-only shared-use memory — no conflict, borders, territory, forced movement, stress, population, yield, or support mechanics."
      />
    </>
  );
}

export function LineageIdentityDetails({
  band,
  world,
}: {
  readonly band: Band;
  readonly world: WorldState | null;
}) {
  const currentTick = world?.time.tick ?? (0 as TickNumber);
  const parent =
    band.parentBandId !== undefined && world !== null ? world.bands[band.parentBandId] : undefined;

  const identity = world !== null
    ? deriveLineageIdentity(band, parent, world, currentTick)
    : undefined;

  const swatch = (color: string) => ({
    display: "inline-block",
    width: "12px",
    height: "12px",
    borderRadius: "var(--radius-sm)",
    marginRight: "4px",
    background: color,
    verticalAlign: "middle",
  });

  return (
    <>
      <div className="tile-detail-heading">Lineage identity (RANGE-3)</div>
      {identity === undefined ? (
        <Detail label="status" value="world not loaded" />
      ) : (
        <>
          <Detail label="state" value={identity.state} />
          <div className="lineage-color-relation">
            <span style={swatch(band.color)} aria-hidden />
            <span style={swatch(identity.identityColor)} aria-hidden />
            <span>band colour / identity colour</span>
          </div>
          <Detail label="own core place count" value={String(identity.ownCorePlaceCount)} />
          <Detail label="shared range with parent" value={String(identity.sharedRangeWithParent)} />
          <Detail label="ticks since fission" value={String(identity.ticksSinceFission)} />
          <Detail label="recognized separate" value={identity.recognizedSeparate ? "yes" : "no"} />
          <Detail
            label="reason ids"
            value={identity.reasonIds.length > 0 ? identity.reasonIds.join(", ") : "none"}
          />
          <Detail
            label="guard"
            value="display-only lineage identity — derived; does not change simulation behaviour."
          />
        </>
      )}
    </>
  );
}

function formatReportLabel(report: WordOfMouthReport, world: WorldState | null): string {
  const source = world?.bands[report.sourceBandId]?.name ?? String(report.sourceBandId);
  return `${formatReportTopic(report.topic)} from ${source}`;
}

function formatReportValue(report: WordOfMouthReport, band: Band): string {
  const knownState =
    report.targetTileId === undefined
      ? "region only"
      : band.knowledge.observedTiles[report.targetTileId] === undefined
        ? "anchor unconfirmed"
        : "anchor personally seen";
  const target = formatReportRegion(report.regionTarget);
  const contact = report.contactMechanism === undefined
    ? "contact path n/a"
    : `${report.contactMechanism}${report.contactDistanceTiles === undefined ? "" : ` ${report.contactDistanceTiles} tiles`}`;
  const reply = report.replyStatus === undefined || report.replyStatus === "none"
    ? "no grounded reply"
    : `${report.replyStatus}${report.replyGrounding === undefined ? "" : ` via ${report.replyGrounding}`}`;
  const sourceBias = report.sourceBiasKind === undefined || report.sourceBiasKind === "none"
    ? "no source bias"
    : `${report.sourceBiasKind}${report.sourceBiasReason === undefined ? "" : ` (${report.sourceBiasReason})`}`;

  return `${target} · conf ${formatNumber(report.confidence)} · fresh ${formatNumber(report.freshness)} · ${report.sourceBasis} · ${report.trustBasis} · ${contact} · hops ${report.hops}/relay ${report.relayHopCount ?? 0} · ${report.distortionLevel} · ${sourceBias} · ${report.receiverDisposition} · ${report.confirmationStatus} · ${reply} · ${knownState}`;
}

function formatReportTopic(topic: WordOfMouthReport["topic"]): string {
  switch (topic) {
    case "good_fishing":
      return "good fishing";
    case "good_fishing_region":
      return "good fishing region";
    case "reliable_water":
      return "reliable water";
    case "good_water_region":
      return "good water region";
    case "bad_water_warning":
      return "bad water warning";
    case "animal_abundance":
      return "animal abundance";
    case "animals_seen":
      return "animal signs";
    case "animal_danger":
      return "animal danger";
    case "animal_danger_or_avoidance":
      return "animal caution";
    case "hunting_potential":
      return "hunting potential";
    case "gathering_potential":
      return "gathering potential";
    case "seasonal_opportunity":
      return "seasonal opportunity";
    case "seasonal_resource_pulse":
      return "seasonal resource pulse";
    case "ford_or_crossing":
      return "ford or crossing";
    case "ford_or_crossing_known":
      return "known crossing";
    case "tributary_route":
      return "tributary route";
    case "tributary_route_hint":
      return "tributary route hint";
    case "creek_valley_hint":
      return "creek valley hint";
    case "possible_pass_through_hills":
      return "possible hill passage";
    case "poor_return_warning":
      return "poor return warning";
    case "poor_return_region":
      return "poor return region";
    case "crowded_range_warning":
      return "crowded range warning";
    case "crowded_water_warning":
      return "crowded water warning";
    case "outsider_use_warning":
      return "outsider use warning";
    case "good_delta_or_wetland":
      return "good delta or wetland";
    case "safe_side_country":
      return "safe side-country";
    case "better_land_speculation":
      return "better land speculation";
    case "dry_place_warning":
      return "dry place warning";
    case "snow_or_winter_hardship_warning":
      return "winter hardship warning";
    case "good_camp_region":
      return "good camp region";
    case "return_to_known_place":
      return "return to known place";
    case "uncertain_edge_opportunity":
      return "uncertain edge opportunity";
    case "avoid_place":
      return "avoid place";
    case "unknown_general":
      return "general report";
    case "unknown_story_or_guess":
      return "uncertain story";
  }
}

function formatReportRegion(region: WordOfMouthReport["regionTarget"]): string {
  return `${formatReportRegionKind(region.regionKind)} · ${formatReportDirection(region.directionFromReceiver)} · ${formatReportPrecision(region.precision)}`;
}

function formatReportRegionKind(kind: WordOfMouthReport["regionTarget"]["regionKind"]): string {
  switch (kind) {
    case "river_reach":
      return "river reach";
    case "tributary_corridor":
      return "tributary corridor";
    case "creek_valley":
      return "creek valley";
    case "delta_or_wetland":
      return "delta / wetland";
    case "lake_shore":
      return "lake shore";
    case "opposite_bank":
      return "opposite bank";
    case "upland_slope":
      return "upland slope";
    case "mountain_pass":
      return "mountain pass";
    case "dry_margin":
      return "dry margin";
    case "forest_edge":
      return "forest edge";
    case "familiar_range_edge":
      return "range edge";
    case "ford_area":
      return "ford area";
    case "crowded_water_place":
      return "shared water place";
    case "unknown_directional_area":
      return "uncertain area";
  }
}

function formatReportDirection(direction: WordOfMouthReport["regionTarget"]["directionFromReceiver"]): string {
  switch (direction) {
    case "upstream":
      return "upstream";
    case "downstream":
      return "downstream";
    case "across_river":
      return "across water";
    case "toward_hills":
      return "toward hills";
    case "toward_mountains":
      return "toward mountains";
    case "toward_lake":
      return "toward lake";
    case "toward_delta":
      return "toward delta";
    case "along_tributary":
      return "along tributary";
    case "beyond_known_edge":
      return "beyond known edge";
    case "near_parent_range":
      return "near parent range";
    case "uncertain":
      return "direction uncertain";
  }
}

function formatReportPrecision(precision: WordOfMouthReport["regionTarget"]["precision"]): string {
  switch (precision) {
    case "exact_observed_area":
      return "observed area";
    case "approximate_region":
      return "approximate";
    case "vague_direction":
      return "vague";
    case "story_only":
      return "story only";
  }
}

function formatSpeculationHypothesis(hypothesis: ReportedKnowledgeSpeculation["hypothesis"]): string {
  switch (hypothesis) {
    case "better_land_possible":
      return "better land possible";
    case "water_likely":
      return "water likely";
    case "animals_likely":
      return "animals likely";
    case "fish_likely":
      return "fish likely";
    case "route_likely_continues":
      return "route may continue";
    case "risk_likely":
      return "risk likely";
    case "crowding_likely":
      return "crowding likely";
    case "poor_return_likely":
      return "poor returns likely";
  }
}

function formatRangeFrictionLabel(event: RangeFrictionEvent, world: WorldState | null): string {
  const other = world?.bands[event.otherBandId]?.name ?? String(event.otherBandId);
  return `${formatRangeFrictionTerm(event.interpretation)} · ${other}`;
}

function formatRangeFrictionValue(event: RangeFrictionEvent): string {
  const tile = event.tileId === undefined ? "area only" : String(event.tileId);
  const link =
    event.linkedReportId !== undefined
      ? ` · report ${event.linkedReportId}`
      : event.linkedActivityTripId !== undefined
        ? " · linked activity trip"
        : "";

  return `${tile} · ${formatRangeFrictionTerm(event.observerRangeTier)} · ${formatRangeFrictionTerm(event.otherActivityKind)} · ${formatRangeFrictionTerm(event.relation)} · ${formatRangeFrictionTerm(event.tensionLevel)} · ${formatRangeFrictionTerm(event.confidence)} · repeat ${event.recurrenceCount} / recent ${event.recentOverlapCount}${link}`;
}

function formatRangeFrictionTerm(value: string): string {
  return value.replace(/_/g, " ");
}

export function OutwardEstablishmentDetails({
  band,
  world,
}: {
  readonly band: Band;
  readonly world: WorldState | null;
}) {
  const dc = band.daughterColonization;
  const ps = band.pressureState;
  const fd = band.frontierDispersal;
  const fordSummary =
    world !== null ? deriveFordContext(band, world) : undefined;

  const hasAny = dc !== undefined || ps !== undefined || fd !== undefined;

  return (
    <>
      <div className="tile-detail-heading">Outward establishment (RANGE-3, report-only)</div>
      {!hasAny ? (
        <Detail label="status" value="no outward-establishment signals" />
      ) : (
        <>
          {dc !== undefined && (
            <>
              <Detail label="daughter colonization pressure" value={dc.pressure.toFixed(2)} />
              <Detail label="recommended action" value={dc.recommendedAction} />
              <Detail label="parent range saturation" value={dc.parentRangeSaturation.toFixed(2)} />
              <Detail label="per-capita stress" value={dc.currentPerCapitaStress.toFixed(2)} />
              {dc.bestKnownUnusedHabitatOpportunity !== undefined && (
                <Detail
                  label="best unused habitat opportunity"
                  value={`${String(dc.bestKnownUnusedHabitatOpportunity.candidateTileId)} (per-capita ${formatNumber(
                    dc.bestKnownUnusedHabitatOpportunity.expectedPerCapitaReturn,
                  )}, conf ${formatNumber(dc.bestKnownUnusedHabitatOpportunity.confidence)})`}
                />
              )}
            </>
          )}
          {ps !== undefined && (
            <>
              <Detail label="parent core overlap" value={ps.parentCoreOverlap.toFixed(2)} />
              <Detail label="daughter dispersal pressure" value={ps.daughterDispersalPressure.toFixed(2)} />
              <Detail label="safe frontier pull" value={ps.safeFrontierPull.toFixed(2)} />
              <Detail label="crowding penalty" value={ps.crowdingPenalty.toFixed(2)} />
              <Detail
                label="crowding band ids"
                value={ps.crowdingBandIds.length > 0 ? ps.crowdingBandIds.join(", ") : "none"}
              />
              <Detail label="nearby band pressure" value={ps.nearbyBandPressure.toFixed(2)} />
            </>
          )}
          {fd !== undefined && (
            <>
              <Detail label="frontier dispersal pressure" value={fd.pressure.toFixed(2)} />
              <Detail label="preferred corridor" value={fd.preferredCorridor} />
              {fd.bestFrontierTileId !== undefined && (
                <Detail label="best frontier tile" value={String(fd.bestFrontierTileId)} />
              )}
            </>
          )}
        </>
      )}
      {fordSummary !== undefined && (
        <Detail
          label="fords"
          value={`known ${fordSummary.counts.total} · with memory ${fordSummary.counts.withMemory} · usable ${fordSummary.counts.usable}`}
        />
      )}
      <Detail
        label="guard"
        value="report-only — derived from this band's own state; not territory, ownership, or war."
      />
    </>
  );
}

export function formatSeasonalEcologyObservation(observation: SeasonalEcologyObservation): string {
  const bySeason = (["spring", "summer", "autumn", "winter"] as const)
    .map((season) => {
      const value = observation.seasonalReliabilityBySeason[season];
      return value === undefined ? null : `${season.slice(0, 2)}=${formatNumber(value)}`;
    })
    .filter((entry): entry is string => entry !== null)
    .join(" ");

  return `${observation.domain}; ${bySeason || "no season data"}; dryConcern=${formatNumber(
    observation.drySeasonConcern,
  )}; wetOpp=${formatNumber(observation.wetSeasonOpportunity)}; ✓${observation.repeatedSeasonalSuccessCount}/✗${observation.repeatedSeasonalFailureCount}`;
}

export function LaborActivityGroupDetails({
  band,
}: {
  readonly band: Band;
}) {
  const summary = band.activityLaborSummary;

  if (summary === undefined) {
    return (
      <>
        <div className="tile-detail-heading">Labor / Activity Groups</div>
        <Detail label="total people" value={formatPopulation(band.demography.population)} />
        <Detail label="working adults" value={formatPopulation(band.demography.workingAdults)} />
        <Detail label="snapshot" value="no activity-labor snapshot yet" />
        <Detail label="guard" value="debug/accounting only; no food/yield coupling yet" />
      </>
    );
  }

  const latest = summary.latestActivityGroupSummary;

  return (
    <>
      <div className="tile-detail-heading">Labor / Activity Groups</div>
      <Detail label="total people" value={formatPopulation(summary.totalPeople)} />
      <Detail label="working adults" value={formatPopulation(summary.workingAdults)} />
      <Detail
        label="snapshot day"
        value={`day ${getDayOfSeason(summary.day)} ${summary.season}, t${Number(summary.tick)}, ${summary.allocationConfidence}`}
      />
      <Detail
        label="assigned / away / base"
        value={`${summary.peopleAssignedToActivityGroups} assigned, ${summary.peopleAwayInActivityGroups} away after day, ${summary.peopleAtResidentialCenterEstimate} at base est.`}
      />
      <Detail label="active groups" value={String(summary.activeActivityGroupCount)} />
      <Detail label="scope" value="latest sampled activity day; accounting only" />
      <Detail label="groups by type" value={formatActivityTypeLabor(summary.peopleByActivityType)} />
      <Detail
        label="latest group"
        value={latest === undefined ? "none" : formatLaborGroup(latest)}
      />
      <Detail
        label="allocation cap"
        value={
          summary.cappedAllocation
            ? `capped ${summary.impossibleOverAllocationCount} group(s) to working adults`
            : "within working-adult capacity"
        }
      />
      <Detail label="guard" value={formatLaborGuard(summary)} />
      {summary.recentActivityGroupSummaries.slice(1, 4).map((record) => (
        <Detail
          key={`${String(record.sourceBandId)}:${Number(record.sourceTripDay)}:${String(record.targetTileId)}:${record.taskGroupType}`}
          label={`labor d${getDayOfSeason(record.sourceTripDay)}`}
          value={formatLaborGroup(record)}
        />
      ))}
    </>
  );
}

export function formatActivityTypeLabor(
  entries: NonNullable<Band["activityLaborSummary"]>["peopleByActivityType"],
): string {
  if (entries.length === 0) {
    return "none";
  }

  return entries
    .map((entry) => `${entry.taskGroupType} ${entry.groupCount}g/${entry.assignedPeopleEstimate}p`)
    .join(", ");
}

export function formatLaborGroup(record: ActivityGroupLaborRecord): string {
  return `${record.groupLabel} (${record.assignedPeopleEstimate}/${record.estimatedPeopleCount} people est.); ${record.objectiveLabel}; ${record.status}; ${record.activityOutcome}; ${record.resourceReturn.returnedResourceKind}; ${record.activityMemoryEffect.effectType}; ${String(record.targetTileId)}`;
}

export function formatLaborGuard(summary: NonNullable<Band["activityLaborSummary"]>): string {
  return summary.noFoodCoupling &&
    summary.noYieldCoupling &&
    summary.noCarryingCapacityCoupling &&
    summary.noPopulationChange &&
    summary.noStressChange
    ? "debug/accounting only; no food/yield/capacity/stress/pop coupling"
    : "guard failed";
}

export function getDayOfSeason(day: IntraSeasonTripRecord["day"]): number {
  return ((Number(day) - 1) % SEASON_LENGTH_DAYS) + 1;
}

export function formatActivityTrip(trip: IntraSeasonTripRecord): string {
  return `${trip.groupLabel} (${trip.estimatedPeopleCount}); ${trip.objectiveLabel}; ${trip.cause}; ${String(
    trip.targetTileId,
  )}; ${trip.distanceTiles} out/${trip.roundTripTiles} round; ${trip.outcome}; ${trip.activityOutcome}; ${trip.resourceReturn.returnedResourceKind}${formatPlantPatchTrace(trip)}; memory=${trip.activityMemoryEffect.effectType}; ${formatTripGuard(trip)}`;
}

export function formatActivityTripStatus(trip: IntraSeasonTripRecord): string {
  const timing =
    trip.outcome === "returns_same_day"
      ? "same-day"
      : trip.outcome === "overnight"
        ? "overnight"
        : "continuing";
  const delayed = trip.activityResult === "delayed_return" ? "delayed return" : "not delayed";

  return `${timing}; ${delayed}; ${trip.activityStatus}; ${trip.movementType}`;
}

export function formatActivityReturn(trip: IntraSeasonTripRecord): string {
  const returned = trip.resourceReturn;

  return `${returned.returnedResourceKind}; value=${formatNumber(
    returned.estimatedReturnValue,
  )}; conf=${formatNumber(returned.returnConfidence)}; reasons ${formatReasonIds(
    returned.reasonIds,
  )}; consumedByEconomy=${String(returned.consumedByEconomy)}`;
}

export function formatActivityShadow(trip: IntraSeasonTripRecord): string {
  const shadow = trip.shadowSubsistence;

  return `${shadow.shadowReturnKind}/${shadow.shadowSupportDomain}; gross=${formatNumber(
    shadow.shadowGrossValue,
  )}; travel=${formatNumber(shadow.shadowTravelCost)}; risk=${formatNumber(
    shadow.shadowRiskPenalty,
  )}; net=${formatNumber(shadow.shadowNetValue)}; same-day-base=${shadow.contributesAtBaseSameDay ? "yes" : "no"}; economy=${String(
    shadow.shadowConsumedByEconomy,
  )}`;
}

export function formatSeasonalEcology(trip: IntraSeasonTripRecord): string {
  const ecology = trip.seasonalEcology;

  if (ecology === undefined) {
    return "none recorded";
  }

  return `${ecology.domain} ${ecology.season}: avail=${formatNumber(ecology.availabilityFactor)} (Δ${formatNumber(
    ecology.seasonalDelta,
  )} vs baseline), ${ecology.wetDryTendency}, ${ecology.hiddenTendencyClass}; shadow ${ecology.shadowSeasonalResult} (×${formatNumber(
    trip.shadowSubsistence.seasonalEcologyModifier,
  )}); taught=${ecology.taughtSeasonalHint ? "yes" : "no"}`;
}

export function formatTripGuard(trip: IntraSeasonTripRecord): string {
  return trip.noResidentialRelocation &&
    trip.noYieldChange &&
    trip.noStressChange &&
    trip.noPopulationChange &&
    trip.noCarryingCapacityChange &&
    trip.noSupportChange &&
    trip.resourceReturn.consumedByEconomy === false &&
    trip.resourceReturn.noYieldCoupling &&
    trip.resourceReturn.noCarryingCapacityCoupling &&
    trip.resourceReturn.noPopulationChange &&
    trip.resourceReturn.noStressChange &&
    trip.resourceReturn.noSupportChange &&
    trip.activityMemoryEffect.noHiddenTruth &&
    trip.activityMemoryEffect.targetKnownMemoryOnly &&
    trip.activityMemoryEffect.noNewResourceDiscovery &&
    trip.activityMemoryEffect.noFoodCoupling &&
    trip.activityMemoryEffect.noYieldCoupling &&
    trip.activityMemoryEffect.noCarryingCapacityCoupling &&
    trip.activityMemoryEffect.noPopulationChange &&
    trip.activityMemoryEffect.noStressChange &&
    trip.activityMemoryEffect.noSupportChange &&
    trip.bandKnownTargetOnly
    ? "no relocation/yield/support/stress/pop/cap, known target, no hidden truth"
    : "guard failed";
}

export function formatReasonIds(reasonIds: readonly string[]): string {
  return reasonIds.length === 0 ? "none" : reasonIds.join(", ");
}

function formatCountSummary(counts: readonly { readonly key: string; readonly count: number }[]): string {
  if (counts.length === 0) {
    return "none";
  }

  return counts.map((entry) => `${entry.key}=${entry.count}`).join(", ");
}

export function formatActivityOutcomes(
  entries: NonNullable<Band["activityOutcomeSummary"]>["outcomesByType"],
): string {
  if (entries.length === 0) {
    return "none";
  }

  return entries.map((entry) => `${entry.outcome} ${entry.count}`).join(", ");
}

export function formatActivityReturns(
  entries: NonNullable<Band["activityOutcomeSummary"]>["returnsByResourceKind"],
): string {
  if (entries.length === 0) {
    return "none";
  }

  return entries
    .map((entry) => `${entry.returnedResourceKind} ${entry.count}/v${formatNumber(entry.estimatedReturnValueTotal)}`)
    .join(", ");
}

export function formatOutcomeGuard(summary: NonNullable<Band["activityOutcomeSummary"]>): string {
  return summary.consumedByEconomy === false &&
    summary.noYieldCoupling &&
    summary.noCarryingCapacityCoupling &&
    summary.noPopulationChange &&
    summary.noStressChange &&
    summary.noSupportChange
    ? "record-only; no yield/support/capacity/stress/pop coupling"
    : "guard failed";
}

export function formatActivityMemoryEffect(effect: ActivityMemoryEffectRecord): string {
  const patch = effect.patchId === undefined ? "no patch" : String(effect.patchId);
  const channel = effect.mainConfidenceChannel === undefined ? "confidence" : effect.mainConfidenceChannel;
  const delta = effect.confidenceDelta >= 0 ? `+${formatNumber(effect.confidenceDelta)}` : formatNumber(effect.confidenceDelta);

  return `${effect.effectType}; ${patch}; ${String(effect.targetTileId)}; ${channel} ${delta}; ${effect.effectSummary}`;
}

export function formatActivityMemoryEffectCounts(
  entries: NonNullable<Band["activityMemoryUpdateSummary"]>["effectCounts"],
): string {
  if (entries.length === 0) {
    return "none";
  }

  return entries.map((entry) => `${entry.effectType} ${entry.count}`).join(", ");
}

export function formatActivityMemoryGuard(summary: NonNullable<Band["activityMemoryUpdateSummary"]>): string {
  return summary.noHiddenTruth &&
    summary.targetKnownMemoryOnly &&
    summary.noNewResourceDiscovery &&
    summary.noFoodCoupling &&
    summary.noYieldCoupling &&
    summary.noCarryingCapacityCoupling &&
    summary.noPopulationChange &&
    summary.noStressChange &&
    summary.noSupportChange
    ? "memory only; no hidden truth; no food/yield/support/capacity/stress/pop coupling"
    : "guard failed";
}

export function SeasonalRoundDetails({
  band,
  world,
}: {
  readonly band: Band;
  readonly world: WorldState | null;
}) {
  const round = band.seasonalRound;
  const state = band.seasonalRoundState;
  const timeline = band.seasonalTimeline;
  const rotation = band.roundCatchmentRotation;
  const behaviorBasis = world === null ? [] : getDryMarginRelevanceBasis(world, band);

  if (round === undefined) {
    return (
      <>
        <div className="tile-detail-heading">Seasonal Round Memory</div>
        <Detail label="state" value="no seasonal round (not water-tethered)" />
        {behaviorBasis.length === 0 ? null : (
          <Detail label="dry-margin basis" value={behaviorBasis.join(", ")} />
        )}
      </>
    );
  }

  return (
    <>
      <div className="tile-detail-heading">Seasonal Round Memory</div>
      <Detail label="round confidence" value={formatNumber(round.confidence)} />
      <Detail label="observed cycles" value={String(round.observedCycleCount)} />
      <Detail label="last phase" value={round.lastPhase} />
      {state === undefined ? null : (
        <>
          <Detail label="current phase" value={state.currentPhase} />
          <Detail label="expected next phase" value={state.expectedNextPhase} />
          <Detail label="phase confidence" value={formatNumber(state.phaseConfidence)} />
          <Detail label="seasonal round pull" value={formatNumber(state.seasonalRoundPull)} />
          <Detail
            label="remembered dry refuge"
            value={state.rememberedDryRefugeTileId === undefined ? "none" : String(state.rememberedDryRefugeTileId)}
          />
          <Detail label="remembered wet range" value={`${state.rememberedWetRangeTileIds.length} tiles`} />
          <Detail
            label="round outcome"
            value={`${state.outcome}${state.roundBlockedReason === undefined ? "" : ` (${state.roundBlockedReason})`}${
              state.roundAbandonedReason === undefined ? "" : ` (${state.roundAbandonedReason})`
            }`}
          />
          <Detail
            label="dry-refuge stickiness"
            value={`${formatNumber(state.dryRefugeStickiness)} (return ${formatNumber(
              state.refugeReturnPull,
            )} / drift -${formatNumber(state.refugeDriftPenalty)})${state.refugeViable ? "" : " refuge-not-viable"}`}
          />
          {state.currentDistanceFromRememberedRefuge === undefined ? null : (
            <Detail label="distance from refuge" value={String(state.currentDistanceFromRememberedRefuge)} />
          )}
        </>
      )}
      {behaviorBasis.length === 0 ? null : (
        <Detail label="dry-margin basis" value={behaviorBasis.join(", ")} />
      )}
      {rotation === undefined ? null : (
        <>
          <div className="tile-detail-heading">Wet Catchment Rotation</div>
          <Detail label="phase" value={rotation.phase} />
          <Detail
            label="rotation (sel/cand)"
            value={`${rotation.selectedCatchmentTileIds.length}/${rotation.candidateTileIds.length}`}
          />
          <Detail label="rotation pressure" value={formatNumber(rotation.rotationPressure)} />
          <Detail label="depletion avoidance" value={formatNumber(rotation.depletionAvoidance)} />
          <Detail label="recently used (reduced)" value={`${rotation.recentlyUsedTileIds.length} tiles`} />
        </>
      )}
      {round.phaseRecords.map((record) => (
        <Detail
          key={record.phase}
          label={record.phase}
          value={`${record.preferredSeason} ok=${record.successCount}/fail=${record.failureCount} water=${formatNumber(
            record.expectedWaterSecurity,
          )} ret=${formatNumber(record.expectedCatchmentReturn)} conf=${formatNumber(record.confidence)}`}
        />
      ))}
      {timeline === undefined || timeline.length === 0 ? null : (
        <>
          <div className="tile-detail-heading">Seasonal Timeline (recent)</div>
          {timeline.slice(-8).map((entry) => (
            <Detail
              key={String(entry.tick)}
              label={`t${String(entry.tick)} ${entry.season}`}
              value={`${entry.phase} · ${entry.actionType} · ${entry.residenceMode ?? "?"} · water=${formatNumber(
                entry.waterSecurity,
              )}`}
            />
          ))}
        </>
      )}
    </>
  );
}

export function MobilityBehaviorBasisDetails({
  band,
  world,
}: {
  readonly band: Band;
  readonly world: WorldState | null;
}) {
  const basis = world === null ? undefined : deriveMobilityBehaviorBasis(world, band);
  const intent = band.currentIntent;

  if (basis === undefined) {
    return null;
  }

  const affinities: readonly [string, number][] = [
    ["river", basis.riverAffinity],
    ["coast", basis.coastAffinity],
    ["wetland/lake", basis.wetlandLakeAffinity],
    ["dry-margin", basis.dryMarginAffinity],
    ["highland/pass", basis.highlandPassAffinity],
    ["frontier", basis.frontierAffinity],
    ["return/refuge", basis.returnRefugeAffinity],
    ["water-seeking", basis.waterSeekingAffinity],
    ["exploration", basis.explorationAffinity],
  ];
  const topAffinities = [...affinities]
    .filter(([, value]) => value > 0.05)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5)
    .map(([label, value]) => `${label} ${formatNumber(value)}`)
    .join(", ");

  return (
    <>
      <div className="tile-detail-heading">Mobility Behavior Basis</div>
      <Detail label="current intent" value={intent?.kind ?? "none"} />
      <Detail label="basis kinds" value={basis.basisKinds.join(", ")} />
      <Detail label="top affinities" value={topAffinities === "" ? "none" : topAffinities} />
      <Detail
        label="profile vs learned"
        value={`profile ${formatNumber(basis.startingProfileWeight)} / learned ${formatNumber(
          basis.learnedExperienceWeight,
        )}${basis.startingProfileOverridden ? " (overridden)" : ""}`}
      />
    </>
  );
}

export function CarryingCapacityDetails({
  band,
  world,
}: {
  readonly band: Band;
  readonly world: WorldState | null;
}) {
  const cc = band.carryingCapacity;

  if (cc === undefined) {
    return null;
  }

  const base = cc.baseHabitatPotential;
  const yieldState = cc.seasonalEffectiveYield;
  const demand = cc.populationDemand;
  const perCapita = cc.perCapitaReturn;
  const support = perCapita.supportDebug;
  const range = band.rangeSaturation;
  const opp = cc.knownUnusedHabitat;
  const dc = cc.daughterColonization;
  const trend = cc.returnTrend;
  const audit = cc.exhaustedRangeAudit;
  const demo = band.demography;

  return (
    <>
      <div className="tile-detail-heading">Carrying Capacity &amp; Effective Yield</div>
      <Detail
        label="base habitat potential"
        value={`forage ${formatNumber(base.foragingPotential)} aquatic ${formatNumber(
          base.aquaticPotential,
        )} water ${formatNumber(base.waterPotential)} diversity ${formatNumber(
          base.resourceDiversity,
        )} recovery ${formatNumber(base.recoveryPotential)}`}
      />
      <Detail
        label="seasonal effective yield"
        value={`${yieldState.season}: eff ${formatNumber(yieldState.effectiveYield)} (base ${formatNumber(
          yieldState.basePotential,
        )}) use -${formatNumber(yieldState.localUsePenalty)} crowd -${formatNumber(
          yieldState.crowdingPenalty,
        )} deplete -${formatNumber(yieldState.depletionPenalty)} recover +${formatNumber(
          yieldState.recoveryBonus,
        )}`}
      />
      {cc.resourceClassSummary !== undefined && (
        <Detail
          label="resource classes (2K, band-known)"
          value={`dominant ${cc.resourceClassSummary.dominantClass} · class-derived ${formatNumber(
            cc.resourceClassSummary.totalSupportFromResources,
          )} (behaviour uses eff ${formatNumber(yieldState.effectiveYield)}) · diversity ${formatNumber(
            cc.resourceClassSummary.resourceDiversity,
          )} · food [${cc.resourceClassSummary.contributionByClass
            .filter((entry) => entry.domain === "food")
            .map((entry) => `${entry.classId}:${formatNumber(entry.supportContribution)}/p${formatNumber(entry.pressure)}`)
            .join(", ")}]`}
        />
      )}
      <Detail
        label="resource knowledge (2K.1F: obs + decay + probe/scout coupling)"
        value={(() => {
          const memories = band.resourceKnowledgeState?.patchMemories ?? [];

          if (memories.length === 0) {
            return "0 memories / substrate ready — no believable opportunity, no probe pressure";
          }

          // Reference tick = the band's most recent observation (active bands observe
          // each tick), so staleness is shown relative to "now" without threading world.
          const nowTick = memories.reduce((max, memory) => Math.max(max, Number(memory.lastNotedTick)), 0);
          const durable = (memory: typeof memories[number]) =>
            memory.risk.poisoningOrBadReaction || memory.risk.badWater || memory.risk.tabooOrAvoidanceFutureFlag;
          let stale = 0;
          let dormant = 0;
          for (const memory of memories) {
            const s = nowTick - Number(memory.lastNotedTick);
            if (s >= 80 && !durable(memory)) dormant += 1;
            else if (s >= 32) stale += 1;
          }
          const distinctClasses = new Set(memories.map((memory) => memory.resourceClassId)).size;

          return `${memories.length} memories · ${distinctClasses} class(es) · ${stale} stale / ${dormant} dormant · ${memories
            .slice(0, 4)
            .map((memory) => `${memory.resourceClassId}@${String(memory.approximateTile)}:${memory.state}`)
            .join(", ")}`;
        })()}
      />
      {(() => {
        const memories = band.resourceKnowledgeState?.patchMemories ?? [];
        if (memories.length === 0) {
          return null;
        }
        const latestMemoryTick = memories.reduce(
          (max, memory) => Math.max(max, Number(memory.lastNotedTick)),
          Number(band.lastResourceScout?.tick ?? 0),
        );
        const candidates = summarizePlantUseEligibilityCandidates(band.resourceKnowledgeState, {
          tick: latestMemoryTick,
          season: band.lastResourceScout?.season ?? "spring",
          foodStress: band.pressureState?.foodStress ?? band.hungerPressure ?? 0,
          perCapitaReturn:
            band.carryingCapacity?.perCapitaReturn.perCapitaReturn ??
            band.perCapitaReturn?.perCapitaReturn ??
            0.5,
          laborCapacity: band.carryingCapacity?.populationDemand.laborCapacity,
          dependencyLoad: band.carryingCapacity?.populationDemand.dependencyLoad,
        }, 3);

        if (candidates.length === 0) {
          return null;
        }

        const counts = candidates.reduce(
          (acc, candidate) => ({
            cautious: acc.cautious + (candidate.eligibilityState === "eligible_cautious" ? 1 : 0),
            known: acc.known + (candidate.eligibilityState === "eligible_known" ? 1 : 0),
            fallback: acc.fallback + (candidate.eligibilityState === "fallback_only" ? 1 : 0),
            blocked: acc.blocked + (candidate.failedGates.length > 0 ? 1 : 0),
          }),
          { cautious: 0, known: 0, fallback: 0, blocked: 0 },
        );
        const entries = candidates
          .map((candidate) => {
            const cls = candidate.plantClassId ?? candidate.linkedResourceClassId;
            const failed = candidate.failedGates.length === 0 ? "gates ok" : `blocked ${candidate.failedGates.join("/")}`;
            return `${cls}@${String(candidate.tileId)} ${candidate.eligibilityState} ${formatNumber(
              candidate.eligibilityScore,
            )} (${failed})`;
          })
          .join(" · ");

        return (
          <Detail
            label="plant use eligibility (readiness only)"
            value={`${candidates.length} known/scouted candidate(s): cautious ${counts.cautious}, known ${counts.known}, fallback ${counts.fallback}, gated ${counts.blocked} · ${entries} · band-known/scouted memory only · no yield/stress/relocation coupling`}
          />
        );
      })()}
      {(() => {
        // 2K.1F: belief-informed probe pressure. Beliefs may raise probe/scout
        // pressure ONLY — never relocation, yield, or stress. The best believed
        // opportunity elsewhere and how (if at all) it nudged probing is shown here.
        // Reference tick = the band's most recent observation (same convention as the
        // resource-knowledge staleness line above), so no world threading is needed.
        const beliefMemories = band.resourceKnowledgeState?.patchMemories ?? [];
        const beliefNowTick = beliefMemories.reduce(
          (max, memory) => Math.max(max, Number(memory.lastNotedTick)),
          0,
        );
        const belief = deriveResourceBeliefOpportunity(band.resourceKnowledgeState, {
          currentTileId: band.position,
          currentTick: beliefNowTick,
          waterStress: band.pressureState?.waterStress ?? 0,
          perCapitaReturn:
            band.carryingCapacity?.perCapitaReturn.perCapitaReturn ??
            band.perCapitaReturn?.perCapitaReturn ??
            0.5,
          chronicDecline: band.returnTrend?.chronicDecline === true,
        });

        if (!belief.hasBelievableOpportunity) {
          return (
            <Detail
              label="resource belief → probe pressure"
              value="no believable opportunity elsewhere — no probe/scout nudge (probe pressure only)"
            />
          );
        }

        const best =
          belief.bestBeliefTile === undefined
            ? "n/a"
            : `${belief.bestBeliefClass}@${String(belief.bestBeliefTile)} (${belief.bestBeliefSource}, conf ${formatNumber(
                belief.bestBeliefConfidence,
              )})`;

        return (
          <Detail
            label="resource belief → probe pressure"
            value={`opportunity ${formatNumber(belief.beliefOpportunityScore)} · best ${best}${
              belief.onlyInferred ? " · INFERRED-only (not treated as observed)" : ""
            } · probe pressure ${formatNumber(belief.probePressure)}${
              belief.stressProbePressure > 0 ? ` (stress-widened +${formatNumber(belief.stressProbePressure)})` : ""
            } — probe/scout pressure ONLY, never relocation/yield/stress`}
          />
        );
      })()}
      {(() => {
        // 2K.1G: probe target diversity + diminishing returns for the band's current
        // best logistical-probe target. Probe-quality only — never relocation/yield.
        const prospect = band.dryMarginContext?.riverProspect;
        const bestTarget = prospect?.bestProspectTileId;
        const memory = band.probeMemory;
        if (bestTarget === undefined) {
          if (memory === undefined || memory.recentTargets.length === 0) {
            return null;
          }
          return (
            <Detail
              label="probe diversity / diminishing returns"
              value={`no current probe target · ${memory.recentTargets.length} recently-probed target(s)`}
            />
          );
        }
        const nowTick = Number(memory?.lastProbeTick ?? 0);
        const dr = deriveProbeDiminishingReturn(memory, bestTarget, nowTick, {
          waterStress: band.pressureState?.waterStress ?? 0,
          routeConfidence: prospect?.confidence ?? 0.5,
          hasAlternativeTarget: (prospect?.candidateTileIds.length ?? 0) > 1,
          resourceBeliefRelevant: false,
          exhaustedRangeStress: band.exhaustedRangeAudit?.stressLevel ?? 0,
        });
        return (
          <Detail
            label="probe diversity / diminishing returns"
            value={`target ${String(bestTarget)} (${prospect?.candidateTileIds.length ?? 0} candidate(s)) · novelty ${formatNumber(
              dr.probeNoveltyScore,
            )} · repeats ${dr.recentProbeRepeatCount} (no-gain ${dr.consecutiveNoGain}) · DR penalty ${formatNumber(
              dr.probeDiminishingReturnPenalty,
            )} · reason ${dr.probeReason}${dr.sameTargetLoopDetected ? " · SAME-TARGET LOOP" : ""}${
              dr.waterNeedOverridesDiversity ? " · water_need_overrides_probe_diversity" : ""
            }`}
          />
        );
      })()}
      {(() => {
        // 2K.1H: latest resource_scout (information action; residence-unchanged). Shows
        // why it scouted, what it learned, and that it did NOT move.
        const scout = band.lastResourceScout;
        if (scout === undefined) {
          return null;
        }
        const learning = scout.learning;
        const plantObservation = scout.plantObservation;
        const plantUse = scout.plantUseEligibility;
        const plantUseTest = scout.plantUseTest;
        const plantText =
          plantObservation === undefined
            ? ""
            : ` · plant hint ${
              plantObservation.observedPlantClassId ?? "none"
              } ${plantObservation.observedLifecycleState}/${plantObservation.observedSeasonalState} ${plantObservation.observedConditionHint} proc=${
                plantObservation.suspectedProcessingNeed ? "yes" : "no"
              } safety=${plantObservation.suspectedSafetyRisk ? "yes" : "no"} fallback=${
                plantObservation.fallbackRoleHint
              } hidden=${String(plantObservation.trueValueHiddenFromBand)}`;
        const plantUseText =
          plantUse === undefined
            ? ""
            : ` · plant use ${plantUse.eligibilityState} score ${formatNumber(plantUse.eligibilityScore)} gates ${
                plantUse.failedGates.length === 0 ? "ok" : plantUse.failedGates.join("/")
              } readiness=${plantUse.dietBreadthReadiness}`;
        const plantUseTestText =
          plantUseTest === undefined
            ? ""
            : ` · test ${plantUseTest.testKind}/${plantUseTest.motivation} → ${plantUseTest.result} safety ${formatNumber(
                plantUseTest.safetyBefore,
              )}→${formatNumber(plantUseTest.safetyAfter)} proc ${formatNumber(plantUseTest.processingBefore)}→${formatNumber(
                plantUseTest.processingAfter,
              )} ${plantUseTest.memoryUpdated ? "memory updated" : "no memory update"} no yield/stress/mortality/relocation`;
        const causeEvent = scout.causeSpecificEvent;
        const readiness = causeEvent === undefined ? undefined : deriveCauseStressReadiness(causeEvent);
        const causeStressV0 =
          causeEvent === undefined
            ? undefined
            : deriveCauseStressContributionV0(causeEvent, { enabled: CAUSE_STRESS_V0_UI_ENABLED });
        const causeText =
          causeEvent === undefined
            ? ""
            : ` · cause ${causeEvent.causeKind}/${causeEvent.severity} (${causeEvent.confidence}) → ${causeEvent.outcome} effect=${causeEvent.memoryEffect} safety ${formatNumber(
                causeEvent.safetyBefore,
              )}→${formatNumber(causeEvent.safetyAfter)} ${causeEvent.memoryUpdated ? "memory updated" : "no memory update"}${
                readiness === undefined
                  ? ""
                  : ` · readiness ${readiness.stressDomain}/${readiness.stressReadiness} → future ${readiness.wouldAffectFuture.join("+")} (readiness only — appliedToActualStress=false)`
              }${
                causeStressV0 === undefined
                  ? ""
                  : ` · cause-stress v0 [${causeStressV0.flagEnabled ? "ENABLED" : "disabled (flag off)"}] ${causeStressV0.stressDomain}: would-apply ${formatNumber(
                      causeStressV0.cappedStressDelta,
                    )} → applied ${formatNumber(causeStressV0.appliedStressDelta)} (${
                      causeStressV0.v0Eligible ? "v0-eligible" : "not v0-eligible"
                    }; nonlethal · reversible · audited · separate field, not pressureState)`
              } · nonlethal scaffold only — no death/pop/stress/yield/relocation`;
        // 2K.5: bounded patch-return guidance behind the target selection (selection-only;
        // the scout still only observes/tests — never yield/support/stress).
        const guidance = scout.patchReturnGuidance;
        const guidanceText =
          guidance === undefined || guidance.guidanceReason === "no_guidance"
            ? ""
            : ` · patch-return guidance ${guidance.guidanceReason} (bias ${guidance.selectionBias >= 0 ? "+" : ""}${formatNumber(
                guidance.selectionBias,
              )}, readiness=${guidance.readiness}, risk=${guidance.riskState}, ${guidance.confidence}) — selection only, knowledge only, no yield/support/stress`;
        return (
          <Detail
            label="resource scout (latest)"
            value={`${scout.scoutKind} @ ${String(scout.targetTile)} (${scout.targetSource}, ${scout.candidateCount} cand) · expected P${formatNumber(
              learning.expectedPresence,
            )}/S${formatNumber(learning.expectedSeasonalFit)}/Y${formatNumber(
              learning.expectedYieldHint,
            )}, found P${formatNumber(learning.observedPresenceHint)}/S${formatNumber(
              learning.observedSeasonalFit,
            )}/Y${formatNumber(learning.observedYieldHint)} · ${scout.outcome} → ${
              scout.contradictionKind
            } · conf ${formatNumber(scout.confidenceBefore)}→${formatNumber(scout.confidenceAfter)} (P ${
              scout.deltaByConfidenceChannel.presenceConfidence >= 0 ? "+" : ""
            }${formatNumber(scout.deltaByConfidenceChannel.presenceConfidence)}, S ${
              scout.deltaByConfidenceChannel.seasonConfidence >= 0 ? "+" : ""
            }${formatNumber(scout.deltaByConfidenceChannel.seasonConfidence)}, Y ${
              scout.deltaByConfidenceChannel.yieldConfidence >= 0 ? "+" : ""
            }${formatNumber(scout.deltaByConfidenceChannel.yieldConfidence)}) · ${
              scout.memoryUpdated ? "memory updated" : "no update"
            }${scout.partialConfirmContradict ? " · partial confirm + channel contradiction" : ""}${plantText}${plantUseText}${plantUseTestText}${causeText}${guidanceText} · no residential move · truth hidden from band`}
          />
        );
      })()}
      {(() => {
        const ring = band.recentPlantUseTests ?? [];
        if (ring.length === 0) {
          return null;
        }
        const entries = ring
          .slice(0, 3)
          .map(
            (entry) =>
              `${entry.testKind}/${entry.result}@${String(entry.tileId)} S ${
                entry.safetyDelta >= 0 ? "+" : ""
              }${formatNumber(entry.safetyDelta)} P ${entry.processingDelta >= 0 ? "+" : ""}${formatNumber(
                entry.processingDelta,
              )}`,
          );
        return (
          <Detail
            label="recent plant tests"
            value={`${ring.length} remembered · ${entries.join(" · ")} · learning/debug only; no food/support`}
          />
        );
      })()}
      {(() => {
        const ring = band.recentCauseSpecificEvents ?? [];
        if (ring.length === 0) {
          return null;
        }
        const entries = ring
          .slice(0, 3)
          .map(
            (entry) =>
              `${entry.causeKind}/${entry.severity}→${entry.outcome}@${String(entry.tileId)} S ${
                entry.safetyDelta >= 0 ? "+" : ""
              }${formatNumber(entry.safetyDelta)} (${entry.memoryEffect})`,
          );
        return (
          <Detail
            label="recent cause events"
            value={`${ring.length} remembered · ${entries.join(" · ")} · nonlethal scaffold only — caution/debug memory; no death, population loss, stress, yield, or relocation`}
          />
        );
      })()}
      {(() => {
        const ring = band.recentScoutLearning ?? [];
        if (ring.length === 0) {
          return null;
        }
        const entries = ring
          .slice(0, 3)
          .map(
            (entry) =>
              `${entry.contradictionKind}@${String(entry.targetTile)} ${entry.mainConfidenceDelta.channel.replace(
                "Confidence",
                "",
              )} ${entry.mainConfidenceDelta.delta >= 0 ? "+" : ""}${formatNumber(entry.mainConfidenceDelta.delta)}`,
          );
        return (
          <Detail
            label="recent scout contradictions"
            value={`${ring.length} remembered · ${entries.join(" · ")} · movement residential_unchanged`}
          />
        );
      })()}
      {(() => {
        // 2K.1H embodied-knowledge placeholder (future: full learned-world-model UI).
        // Compact learned-resource-mechanics view from the band's own patch memories.
        const memories = band.resourceKnowledgeState?.patchMemories ?? [];
        if (memories.length === 0) {
          return null;
        }
        const classes = new Set(memories.map((m) => m.resourceClassId));
        const seasonalFacts = memories
          .filter((m) => m.seasonality.bestSeasons.length > 0)
          .slice(0, 3)
          .map((m) => `${m.resourceClassId}@${String(m.approximateTile)}:${m.seasonality.bestSeasons.join("/")}`);
        const risky = memories.filter((m) => m.risk.poisoningOrBadReaction || m.risk.badWater || m.state === "risky").length;
        const suspected = memories.filter((m) => m.state === "suspected" || m.source === "inferred").length;
        return (
          <Detail
            label="learned resource mechanics (embodied; future full UI)"
            value={`${classes.size} class(es) learned · ${suspected} suspected/inferred · ${risky} risky · seasonal: ${
              seasonalFacts.length === 0 ? "none confirmed yet" : seasonalFacts.join(", ")
            } — not yet full instincts/culture`}
          />
        );
      })()}
      {(() => {
        // 2K.4: observed patch return / exploitation knowledge — DERIVED-ONLY view
        // (no band state). Knowledge only / future exploitation hook: the band is
        // NOT eating from these patches; nothing here feeds yield/support/stress.
        if (world === null) {
          return null;
        }
        const view = deriveBandPatchReturnView({
          currentTick: world.time.tick,
          resourceKnowledgeState: band.resourceKnowledgeState,
          recentPlantUseTests: band.recentPlantUseTests,
          recentCauseSpecificEvents: band.recentCauseSpecificEvents,
        });
        if (view.summary.estimateCount === 0) {
          return null;
        }
        const latest = view.summary.latestUpdated;
        const promising = view.summary.topPromising
          .slice(0, 2)
          .map(
            (e) =>
              `${e.plantClassId ?? e.resourceClassId}@${String(e.tileId)} ${e.exploitationReadiness}/${e.expectedReturn} (${e.confidence}, ${e.memorySource})`,
          );
        const risky = view.summary.topRiskyOrUncertain
          .slice(0, 2)
          .map((e) => `${e.plantClassId ?? e.resourceClassId}@${String(e.tileId)} ${e.riskState}`);
        const readiness = Object.entries(view.summary.readinessCounts)
          .map(([key, count]) => `${key} ${count}`)
          .join(", ");
        return (
          <Detail
            label="patch return / exploitation knowledge (2K.4, derived)"
            value={`${view.summary.estimateCount} estimate(s) · readiness: ${readiness}${
              latest === undefined
                ? ""
                : ` · latest ${latest.plantClassId ?? latest.resourceClassId}@${String(latest.tileId)} ${latest.exploitationReadiness}/${latest.expectedReturn} ${latest.confidence} risk=${latest.riskState} obs ${latest.observationCount}/test ${latest.testCount} src=${latest.source}`
            }${promising.length === 0 ? "" : ` · promising: ${promising.join("; ")}`}${
              risky.length === 0 ? "" : ` · risky/uncertain: ${risky.join("; ")}`
            } · knowledge only / future exploitation hook — no calories, yield, support, stress, or population effect; truth richness hidden`}
          />
        );
      })()}
      <Detail
        label="population demand"
        value={`demand ${formatNumber(demand.adultEquivalentDemand)} labor ${formatNumber(
          demand.laborCapacity,
        )} dependency ${formatNumber(demand.dependencyLoad)} care ${formatNumber(demand.careBurden)}`}
      />
      <Detail
        label="per-capita return"
        value={`${formatNumber(perCapita.perCapitaReturn)} (range yield ${formatNumber(
          perCapita.totalEffectiveYieldWithinRange,
        )}, travel -${formatNumber(perCapita.travelCostToExploitRange)}, nutrition deficit ${formatNumber(
          perCapita.nutritionDeficit,
        )})`}
      />
      <Detail
        label="reachable support (raw → shared)"
        value={`${formatNumber(support.rawReachableSupport)} → ${formatNumber(
          support.sharedReachableSupport,
        )} vs demand ${formatNumber(support.adultEquivalentDemand)} | ${
          support.surplusDeficit >= 0
            ? `surplus +${formatNumber(support.surplusDeficit)}`
            : `deficit ${formatNumber(support.surplusDeficit)}`
        }`}
      />
      <Detail
        label="support ratio (raw vs clamped)"
        value={`raw ${formatNumber(support.rawSupportRatio)} → clamped ${formatNumber(
          support.clampedSupportRatio,
        )} (deficit ratio ${formatNumber(support.deficitRatio)})`}
      />
      {(support.animalSupportRaw !== undefined || support.aquaticSupportRaw !== undefined) && (
        <Detail
          label="fauna / aquatic stocks (FAUNA/AQUATIC-1, finite)"
          value={`animal ${formatNumber(support.animalSupportRaw ?? 0)} · aquatic ${formatNumber(
            support.aquaticSupportRaw ?? 0,
          )} support · stock shortfall -${formatNumber(support.faunaSupportLoss ?? 0)} · ${
            support.faunaCoveredTiles ?? 0
          } catchment tile(s) over a known stock zone${
            (support.faunaSupportLoss ?? 0) > 0.05 ? " · overuse/lean reducing returns" : ""
          }`}
        />
      )}
      {support.plantSupportRaw !== undefined && (
        <Detail
          label="plant patches (ECO-BIOME-1, finite)"
          value={`plant-food ${formatNumber(support.plantSupportRaw ?? 0)} support · overharvest shortfall -${formatNumber(
            support.plantSupportLoss ?? 0,
          )} · processing drag -${formatNumber(support.processingLaborDrag ?? 0)} · ${
            support.plantCoveredTiles ?? 0
          } catchment tile(s) over a known patch${
            (support.plantSupportLoss ?? 0) > 0.05 ? " · overharvest reducing returns until rested" : ""
          }`}
        />
      )}
      <Detail
        label="AG11 activity supplement"
        value={
          support.activitySubsistenceSupplement === undefined
            ? "OFF/default — abstract support floor only; no activity support consumed"
            : `ON experimental supplement, not full economy replacement · floor ${formatNumber(
                support.activitySubsistenceSupplement.abstractSupportFloor,
              )} → final ${formatNumber(
                support.activitySubsistenceSupplement.finalSupportWithSupplement,
              )} · cap ${formatNumber(
                support.activitySubsistenceSupplement.supplementCap,
              )}${support.activitySubsistenceSupplement.supplementCapApplied ? " hit" : ""} · consumed g/h/f/p ${formatNumber(
                support.activitySubsistenceSupplement.supplementFromGathering,
              )}/${formatNumber(
                support.activitySubsistenceSupplement.supplementFromHunting,
              )}/${formatNumber(
                support.activitySubsistenceSupplement.supplementFromFishing,
              )}/${formatNumber(
                support.activitySubsistenceSupplement.supplementFromPlants,
              )} · eligible shadow ${formatNumber(
                support.activitySubsistenceSupplement.activityShadowSameDayFoodEligible,
              )}, delayed tracked ${formatNumber(
                support.activitySubsistenceSupplement.activityShadowDelayedFoodTracked,
              )}`
        }
      />
      <Detail
        label="shared catchment pressure"
        value={`${formatNumber(support.sharedPressurePenalty)} over ${support.overlappingBandIds.length} overlapping band(s); access -${formatNumber(
          support.accessibilityPenalty,
        )}, local use -${formatNumber(support.localUsePenalty)}, realized tiles ${support.realizedCatchmentTileCount}`}
      />
      {range === undefined ? null : (
        <Detail
          label="range saturation"
          value={`${formatNumber(range.saturation ?? 0)} ${range.densityPhase ?? "n/a"} (recovery buffer ${formatNumber(
            range.recoveryBuffer ?? 0,
          )}, high-rank persistence ${formatNumber(range.highRankPersistence ?? 0)})`}
        />
      )}
      {trend === undefined ? null : (
        <Detail
          label="return trend"
          value={`${trend.trendDirection} (mean4 ${formatNumber(trend.mean4)} vs mean8 ${formatNumber(
            trend.mean8,
          )}, Δ ${formatNumber(trend.shortLongDelta)})${trend.chronicDecline ? " — CHRONIC DECLINE" : ""}${
            trend.oneBadSeason ? " — one bad season" : ""
          }`}
        />
      )}
      {audit === undefined ? null : (
        <Detail
          label="exhausted-range audit"
          value={`${audit.status} | stress ${formatNumber(audit.stressLevel)}, known target ${
            audit.hasViableKnownTarget ? "yes" : "no"
          }, route conf ${formatNumber(audit.routeConfidence)}, attach ${formatNumber(
            audit.attachmentHold,
          )}, water ${formatNumber(audit.waterRefugeHold)}${
            audit.anchorOverrodeByMovement ? " | anchor overridden by movement" : ""
          } | belief opp ${formatNumber(audit.beliefOpportunityScore)}${
            audit.onlyInferredOpportunity ? " (inferred-only)" : ""
          }${
            audit.probeSuggestedBeforeRelocation
              ? " → PROBE suggested before relocation (attachment/water hold suppresses relocation, not scouting)"
              : ""
          }`}
        />
      )}
      <Detail
        label="age cohorts"
        value={`dependents ${demo.dependents} adults ${demo.workingAdults} elders ${demo.elders} | +births ${
          demo.lastBirths ?? 0
        } matured ${demo.lastDependentsMatured ?? 0} aged ${demo.lastAdultsAged ?? 0} died ${
          demo.lastEldersDied ?? 0
        }`}
      />
      {opp === undefined ? (
        <Detail label="known unused habitat" value="none within bounded range" />
      ) : (
        <>
          <div className="tile-detail-heading">Known Better / Unused Habitat Audit</div>
          <Detail label="candidate" value={`${String(opp.candidateTileId)} (${opp.opportunityKind})`} />
          <Detail label="basis" value={opp.basis.join(", ")} />
          <Detail
            label="potential / yield / per-capita"
            value={`base ${formatNumber(opp.baseHabitatPotential)} eff ${formatNumber(
              opp.expectedEffectiveYield,
            )} per-capita ${formatNumber(opp.expectedPerCapitaReturn)}`}
          />
          <Detail
            label="penalties"
            value={`water ${formatNumber(opp.waterReliability)} travel -${formatNumber(
              opp.travelCost,
            )} risk -${formatNumber(opp.riskPenalty)} crowding ${formatNumber(
              opp.currentCrowding,
            )} confidence ${formatNumber(opp.confidence)}`}
          />
          <Detail
            label="considered as target"
            value={opp.consideredAsTarget ? "yes" : `no (${opp.rejectionReason ?? "n/a"})`}
          />
          {opp.suspiciousOpportunityIgnored ? (
            <Detail label="⚠ suspicious" value="known, reachable, safe, underused, higher per-capita — still ignored" />
          ) : null}
        </>
      )}
      <Detail
        label="daughter colonization"
        value={`pressure ${formatNumber(dc.pressure)} → ${dc.recommendedAction} (parent sat ${formatNumber(
          dc.parentRangeSaturation,
        )}, per-capita stress ${formatNumber(dc.currentPerCapitaStress)}, risk tol ${formatNumber(
          dc.daughterRiskTolerance,
        )}, attachment -${formatNumber(dc.parentAttachmentPenalty)})`}
      />
    </>
  );
}

export function BiomeAdaptationDetails({
  band,
  currentTile,
}: {
  readonly band: Band;
  readonly currentTile: Tile | undefined;
}) {
  const currentFit = currentTile === undefined
    ? undefined
    : getBiomeAdaptationFit(band.biomeAdaptation, currentTile);
  const topBiomes = Object.values(band.biomeAdaptation.records)
    .filter((record): record is BiomeCompetenceRecord => record !== undefined)
    .sort(compareBiomeRecords)
    .slice(0, 4);

  return (
    <>
      <div className="tile-detail-heading">Biome Adaptation</div>
      <Detail label="current biome" value={band.biomeAdaptation.currentBiomeKind ?? "unknown"} />
      <Detail label="mismatch stress" value={formatNumber(band.biomeAdaptation.mismatchStress)} />
      {currentFit === undefined ? null : (
        <>
          <Detail label="current competence" value={formatNumber(currentFit.competence)} />
          <Detail label="current familiarity" value={formatNumber(currentFit.familiarity)} />
          <Detail label="current mismatch" value={formatNumber(currentFit.mismatchPenalty)} />
        </>
      )}
      {topBiomes.length === 0 ? (
        <Detail label="known biomes" value="none" />
      ) : (
        topBiomes.map((record) => (
          <Detail
            key={record.biomeKind}
            label={record.biomeKind}
            value={`skill=${formatNumber(record.competence)} familiar=${formatNumber(
              record.familiarity,
            )} uses=${record.successfulUseTicks}`}
          />
        ))
      )}
    </>
  );
}

export function DecisionDetails({
  decision,
}: {
  readonly decision: Decision | undefined;
}) {
  if (decision === undefined) {
    return (
      <>
        <div className="tile-detail-heading">Latest decision</div>
        <Detail label="status" value="No decision evaluated yet" />
      </>
    );
  }

  return (
    <>
      <div className="tile-detail-heading">Latest decision</div>
      <Detail label="id" value={String(decision.id)} />
      <Detail
        label="time"
        value={`${decision.time.season} y${decision.time.year} t${decision.time.tick}`}
      />
      <Detail label="action" value={formatAction(decision.action)} />
      <Detail label="intent status" value={decision.intentStatus} />
      <Detail
        label="decision intent"
        value={decision.mobilityIntent?.kind ?? "none"}
      />
      <Detail label="primary reason" value={formatReason(decision.primaryReason)} />
      <Detail
        label="secondary"
        value={
          decision.secondaryReasons.length === 0
            ? "none"
            : decision.secondaryReasons.map(formatReason).join(" | ")
        }
      />
      <Detail label="known tiles" value={String(decision.contextSnapshot.knownTileCount)} />
      <div className="tile-detail-heading">Alternatives</div>
      <div className="decision-alternatives">
        {decision.alternativesConsidered.map((alternative, index) => (
          <DecisionAlternative
            key={`${formatAction(alternative.action)}:${index}`}
            alternative={alternative}
            index={index}
          />
        ))}
      </div>
    </>
  );
}

export function CrowdingDetails({
  band,
  world,
  latestDecision,
}: {
  readonly band: Band;
  readonly world: WorldState | null;
  readonly latestDecision: Decision | undefined;
}) {
  const currentTile = world === null ? undefined : world.tiles[band.position];
  const nearbyPressure =
    world === null ? undefined : getNearbyBandPressure(world, band, band.position);
  const dispersal =
    world === null ? undefined : getDaughterDispersalPressure(world, band, band.position);
  const crowdingPenalty =
    currentTile === undefined || nearbyPressure === undefined
      ? undefined
      : getCrowdingPenalty(currentTile, nearbyPressure);
  const contributingBands =
    world === null || nearbyPressure === undefined
      ? []
      : nearbyPressure.pressureBandIds.map((bandId) => world.bands[bandId]?.name ?? String(bandId));
  const chosenScore = latestDecision?.alternativesConsidered[0]?.scoreBreakdown;
  const crowdingReasons =
    latestDecision === undefined
      ? []
      : [latestDecision.primaryReason, ...latestDecision.secondaryReasons]
          .filter((reason) => isCrowdingReason(reason.type))
          .map(formatReason);

  return (
    <>
      <div className="tile-detail-heading">Inter-band Crowding</div>
      {nearbyPressure === undefined ? (
        <Detail label="nearby band pressure" value="world unavailable" />
      ) : (
        <>
          <Detail label="nearby band pressure" value={formatNumber(nearbyPressure.weightedCrowding)} />
          <Detail label="nearby band count" value={String(nearbyPressure.nearbyBandCount)} />
          <Detail label="parent overlap" value={formatNumber(nearbyPressure.parentOverlap)} />
          <Detail label="daughter overlap" value={formatNumber(nearbyPressure.daughterOverlap)} />
          <Detail
            label="pressure bands"
            value={contributingBands.length === 0 ? "none" : contributingBands.join(", ")}
          />
        </>
      )}
      {dispersal === undefined ? (
        <Detail label="daughter dispersal" value="world unavailable" />
      ) : (
        <>
          <Detail label="parent core overlap" value={formatNumber(dispersal.parentCoreOverlap)} />
          <Detail label="daughter dispersal pressure" value={formatNumber(dispersal.daughterDispersalPressure)} />
          <Detail label="inherited familiarity pull" value={formatNumber(dispersal.inheritedFamiliarityPull)} />
          <Detail label="safe frontier pull" value={formatNumber(dispersal.safeFrontierPull)} />
          <Detail label="kin tolerance" value={formatNumber(dispersal.kinTolerance)} />
          <Detail label="kin safety" value={formatNumber(dispersal.kinSafety)} />
          <Detail label="kin core crowding" value={formatNumber(dispersal.kinCoreCrowding)} />
          <Detail label="early dispersal urgency" value={formatNumber(dispersal.earlyDispersalUrgency)} />
        </>
      )}
      <Detail
        label="crowding penalty"
        value={crowdingPenalty === undefined ? "n/a" : formatNumber(crowdingPenalty)}
      />
      <Detail
        label="latest crowding score"
        value={
          chosenScore === undefined
            ? "no scored decision yet"
            : `nearby=${formatNumber(chosenScore.nearbyBandPressure)} overlap=${formatNumber(
                chosenScore.parentCoreOverlap,
              )} dispersal=${formatNumber(
                chosenScore.daughterDispersalPressure,
              )} frontier=${formatNumber(chosenScore.safeFrontierPull)} penalty=${formatNumber(
                chosenScore.crowdingPenalty,
              )}`
        }
      />
      <Detail
        label="crowding reasons"
        value={crowdingReasons.length === 0 ? "none in latest decision" : crowdingReasons.join(" | ")}
      />
    </>
  );
}

export function BandViabilityDetails({ band }: { readonly band: Band }) {
  const viability = band.viability;

  return (
    <>
      <div className="tile-detail-heading">Band Viability</div>
      {viability === undefined ? (
        <Detail label="viability" value="not evaluated yet" />
      ) : (
        <>
          <Detail label="status" value={viability.status} />
          <Detail label="population" value={formatPopulation(viability.population)} />
          <Detail label="minimum viable" value={String(viability.minimumViablePopulation)} />
          <Detail label="viability pressure" value={formatNumber(viability.viabilityPressure)} />
          <Detail label="extinction risk" value={formatNumber(viability.extinctionRisk)} />
          <Detail label="absorption opportunity" value={formatNumber(viability.absorptionOpportunity)} />
          <Detail label="weak-band classification" value={viability.weakBandClassification ?? "not classified"} />
          <Detail label="weak-band fate" value={viability.weakBandFate ?? "not classified"} />
          <Detail
            label="support-seeking target"
            value={viability.supportSeekingTargetBandId === undefined ? "none" : String(viability.supportSeekingTargetBandId)}
          />
          <Detail label="support grounding" value={viability.supportSeekingGrounding ?? "none"} />
          <Detail label="support blocked reason" value={viability.supportSeekingBlockedReason ?? "none"} />
          <Detail label="route confidence to support" value={formatNumber(viability.routeConfidenceToSupport ?? 0)} />
          <Detail label="last support state" value={viability.lastSupportState ?? "unknown"} />
          <Detail label="last stress" value={viability.lastStressSummary ?? "unknown"} />
          <Detail label="absorbed by" value={viability.absorbedByBandId === undefined ? "none" : String(viability.absorbedByBandId)} />
          <Detail label="population transferred" value={formatPopulation(viability.populationTransferred ?? 0)} />
          <Detail label="population removed" value={formatPopulation(viability.populationRemoved ?? 0)} />
          <Detail label="conservation summary" value={viability.populationConservationSummary ?? "not applicable"} />
        </>
      )}
    </>
  );
}

export function EncounterContactDetails({ band }: { readonly band: Band }) {
  const latestEncounter = band.encounterRecords[band.encounterRecords.length - 1];
  const latestPerception = band.encounterPerceptions[band.encounterPerceptions.length - 1];
  const latestResponse = band.encounterResponses[band.encounterResponses.length - 1];
  const temporarySeparation = band.temporarySeparation;
  const contactMemories = Object.values(band.contactMemories)
    .sort((left, right) =>
      right.lastContactAt.tick === left.lastContactAt.tick
        ? String(left.otherBandId).localeCompare(String(right.otherBandId))
        : right.lastContactAt.tick - left.lastContactAt.tick,
    )
    .slice(0, 5);

  return (
    <>
      <div className="tile-detail-heading">Encounters / Contact</div>
      <Detail label="encounter records" value={String(band.encounterRecords.length)} />
      <Detail label="contact memories" value={String(Object.keys(band.contactMemories).length)} />
      {latestEncounter === undefined ? (
        <Detail label="latest encounter" value="none yet" />
      ) : (
        <>
          <Detail
            label="latest encounter"
            value={`${latestEncounter.kind} ${latestEncounter.bandAId} / ${latestEncounter.bandBId} ${latestEncounter.outcome}`}
          />
          <Detail label="relation" value={latestEncounter.relation} />
          <Detail label="resource pressure" value={formatNumber(latestEncounter.resourcePressure)} />
          <Detail label="crowding pressure" value={formatNumber(latestEncounter.crowdingPressure)} />
          <Detail label="tolerance" value={formatNumber(latestEncounter.tolerance)} />
          <Detail label="tension" value={formatNumber(latestEncounter.tension)} />
        </>
      )}
      {contactMemories.length === 0 ? (
        <Detail label="recent contacts" value="none yet" />
      ) : (
        contactMemories.map((memory) => (
          <Detail
            key={memory.otherBandId}
            label={`contact ${memory.otherBandId}`}
            value={`count=${memory.contactCount} peaceful=${memory.peacefulContactCount} strained=${memory.strainedContactCount} familiar=${formatNumber(
              memory.familiarity,
            )} tension=${formatNumber(memory.tension)} tolerance=${formatNumber(memory.trustLikeTolerance)}`}
          />
        ))
      )}
      <div className="tile-detail-heading">Band Disposition</div>
      {band.disposition === undefined ? (
        <Detail label="disposition" value="not evaluated yet" />
      ) : (
        <>
          <Detail label="dominant mood" value={band.disposition.dominantMood} />
          <Detail label="mood shares" value={formatMoodShares(band.disposition.moodShares)} />
          <Detail label="mood reasons" value={band.disposition.moodReasons.join(" | ") || "none"} />
          <Detail label="cohesion" value={formatNumber(band.disposition.cohesion)} />
          <Detail label="fear" value={formatNumber(band.disposition.fear)} />
          <Detail label="anger" value={formatNumber(band.disposition.anger)} />
          <Detail label="caution" value={formatNumber(band.disposition.caution)} />
          <Detail label="hunger stress" value={formatNumber(band.disposition.hungerStress)} />
          <Detail label="fatigue stress" value={formatNumber(band.disposition.fatigueStress)} />
        </>
      )}
      <div className="tile-detail-heading">Encounter Response</div>
      {latestPerception === undefined ? (
        <Detail label="perception" value="none yet" />
      ) : (
        <>
          <Detail label="perceived threat" value={formatNumber(latestPerception.perceivedThreat)} />
          <Detail label="kin safety" value={formatNumber(latestPerception.perceivedKinshipSafety)} />
          <Detail label="resource competition" value={formatNumber(latestPerception.perceivedResourceCompetition)} />
          <Detail label="escape confidence" value={formatNumber(latestPerception.knownEscapeConfidence)} />
          <Detail label="uncertainty" value={formatNumber(latestPerception.uncertainty)} />
        </>
      )}
      {latestResponse === undefined ? (
        <Detail label="response" value="none yet" />
      ) : (
        <>
          <Detail label="dominant response" value={latestResponse.dominantResponse} />
          <Detail label="response shares" value={formatResponseShares(latestResponse.responseShares)} />
          <Detail label="dissent" value={formatNumber(latestResponse.dissentLevel)} />
          <Detail label="split risk" value={formatNumber(latestResponse.splitRisk)} />
        </>
      )}
      <div className="tile-detail-heading">Temporary Separation Pressure</div>
      {temporarySeparation === undefined ? (
        <Detail label="state" value="none yet" />
      ) : (
        <>
          <Detail label="active" value={temporarySeparation.active ? "yes" : "no"} />
          <Detail label="cause" value={temporarySeparation.cause} />
          <Detail label="separated share" value={formatNumber(temporarySeparation.estimatedSeparatedShare)} />
          <Detail label="reunite intent" value={formatNumber(temporarySeparation.reuniteIntent)} />
          <Detail label="waiting tile" value={temporarySeparation.waitingAtTileId === undefined ? "none" : String(temporarySeparation.waitingAtTileId)} />
          <Detail label="horizon" value={`${temporarySeparation.expectedReunionHorizonTicks} ticks`} />
        </>
      )}
    </>
  );
}

export function PlaceMemoryDetails({
  band,
  currentTileId,
}: {
  readonly band: Band;
  readonly currentTileId: Band["position"];
}) {
  const memories = Object.values(band.placeMemory);
  const topMemories = [...memories]
    .sort(comparePlaceMemories)
    .slice(0, 5);
  const currentMemory = band.placeMemory[currentTileId];
  const returnPlaces = memories.filter((memory) => memory.isReturnPlace).length;

  return (
    <>
      <div className="tile-detail-heading">Place Memory</div>
      <Detail label="remembered places" value={String(memories.length)} />
      <Detail label="return places" value={String(returnPlaces)} />
      {currentMemory === undefined ? (
        <Detail label="current memory" value="none yet" />
      ) : (
        <MemorySummary label="current memory" memory={currentMemory} />
      )}
      {topMemories.length === 0 ? (
        <Detail label="top places" value="none yet" />
      ) : (
        topMemories.map((memory, index) => (
          <MemorySummary key={memory.tileId} label={`top ${index + 1}`} memory={memory} />
        ))
      )}
    </>
  );
}

export function MemorySummary({
  label,
  memory,
}: {
  readonly label: string;
  readonly memory: PlaceMemoryRecord;
}) {
  return (
    <Detail
      label={label}
      value={`${memory.tileId} visits=${memory.visitCount} attach=${formatNumber(
        memory.attachment,
      )} returns=${memory.repeatedReturnCount} ${memory.valences.join(",") || "untyped"}`}
    />
  );
}

export function MovementHistoryDetails({ band }: { readonly band: Band }) {
  const recentMovement = band.movementHistory.slice(-6).reverse();

  return (
    <>
      <div className="tile-detail-heading">Movement History</div>
      <Detail label="movement records" value={String(band.movementHistory.length)} />
      {recentMovement.length === 0 ? (
        <Detail label="recent movement" value="none yet" />
      ) : (
        recentMovement.map((movement) => (
          <MovementSummary key={`${movement.decisionId}:${movement.tick}`} movement={movement} />
        ))
      )}
    </>
  );
}

export function MovementSummary({
  movement,
}: {
  readonly movement: BandMovementRecord;
}) {
  return (
    <Detail
      label={`t${movement.tick}`}
      value={`${movement.fromTileId} -> ${movement.toTileId} ${movement.intentKind ?? "no_intent"}`}
    />
  );
}

// RESIDENTIAL-MOVE-1 — record-only relocation events. Inspection only: the explicit
// guard line states that band.position still updates at the seasonal boundary (this
// view is explanatory, not a daily-movement system).
export function ResidentialMoveDetails({ band }: { readonly band: Band }) {
  const events = band.recentResidentialMoveEvents ?? [];
  const latest = events[0];

  return (
    <>
      <div className="tile-detail-heading">Residential Moves (record-only)</div>
      <Detail label="recorded moves" value={String(events.length)} />
      {latest === undefined ? (
        <Detail label="latest move" value="none yet" />
      ) : (
        <>
          <Detail label="latest kind" value={latest.moveKind} />
          <Detail label="latest cause" value={latest.cause} />
          <Detail label="from -> to" value={`${latest.fromTileId} -> ${latest.toTileId}`} />
          <Detail
            label="season window"
            value={`day ${latest.startDay}-${latest.endDay} (${latest.durationDays}d), ${latest.distanceTiles} tiles`}
          />
          <Detail label="status" value={latest.status} />
          <Detail label="route length" value={String(latest.pathTiles.length)} />
          <Detail label="confidence" value={formatNumber(latest.confidence)} />
          <Detail label="reasons" value={latest.reasonIds.slice(0, 4).join(", ") || "none"} />
          {latest.seasonalMemoryContext !== undefined && (
            <Detail
              label="seasonal memory"
              value={`${latest.seasonalMemoryContext.join("; ")} (2K.12 context — not the move cause)`}
            />
          )}
        </>
      )}
      {events.slice(1).map((event) => (
        <ResidentialMoveSummary key={event.eventId} event={event} />
      ))}
      <Detail
        label="guard"
        value="record-only; band.position still updates at the seasonal boundary"
      />
    </>
  );
}

export function ResidentialMoveSummary({ event }: { readonly event: ResidentialMoveEvent }) {
  return (
    <Detail
      label={`t${event.tick}`}
      value={`${event.fromTileId} -> ${event.toTileId} ${event.moveKind}/${event.cause} (${event.status})`}
    />
  );
}

export function CorridorDetails({
  corridors,
}: {
  readonly corridors: readonly TravelCorridorMemory[];
}) {
  const topCorridors = [...corridors]
    .sort((left, right) =>
      right.useCount === left.useCount
        ? String(left.id).localeCompare(String(right.id))
        : right.useCount - left.useCount,
    )
    .slice(0, 5);

  return (
    <>
      <div className="tile-detail-heading">Familiar Corridors</div>
      <Detail label="corridor count" value={String(corridors.length)} />
      {topCorridors.length === 0 ? (
        <Detail label="top corridors" value="none yet" />
      ) : (
        topCorridors.map((corridor, index) => (
          <Detail
            key={corridor.id}
            label={`corridor ${index + 1}`}
            value={`${corridor.fromTileId} -> ${corridor.toTileId} uses=${corridor.useCount} c=${formatNumber(corridor.confidence)}`}
          />
        ))
      )}
    </>
  );
}

export function RiverCrossingDetails({
  band,
  world,
  latestDecision,
}: {
  readonly band: Band;
  readonly world: WorldState | null;
  readonly latestDecision: Decision | undefined;
}) {
  const crossingMemories = Object.values(band.crossingMemories);
  const topCrossings = [...crossingMemories]
    .sort(compareCrossingMemories)
    .slice(0, 5);
  const latestMovement = band.movementHistory[band.movementHistory.length - 1];
  const latestCrossing =
    world === null || latestMovement === undefined
      ? undefined
      : getRiverCrossingForMovement(world, latestMovement.fromTileId, latestMovement.toTileId);
  const latestSeasonalState =
    world === null || latestCrossing === undefined
      ? undefined
      : getSeasonalRiverCrossingState(world, latestCrossing, getBandCrossingCapability(band));
  const riverReasons =
    latestDecision === undefined
      ? []
      : [latestDecision.primaryReason, ...latestDecision.secondaryReasons]
          .filter((reason) => isRiverReason(reason.type))
          .map(formatReason);

  return (
    <>
      <div className="tile-detail-heading">River Crossings</div>
      <Detail label="known crossings" value={String(crossingMemories.length)} />
      {latestCrossing === undefined ? (
        <Detail label="latest crossing" value="none in latest movement" />
      ) : (
        <Detail
          label="latest crossing"
          value={`${latestCrossing.crossingClass} ${latestCrossing.fromTileId} <> ${latestCrossing.toTileId} cost=${formatNumber(
            latestSeasonalState?.effectiveCrossingCost ?? latestCrossing.baseCrossingCost,
          )} risk=${formatNumber(latestSeasonalState?.effectiveRisk ?? latestCrossing.risk)} blocked=${
            latestSeasonalState?.isBlockedWithoutCapability === true ? "yes" : "no"
          }`}
        />
      )}
      <Detail
        label="river reasons"
        value={riverReasons.length === 0 ? "none in latest decision" : riverReasons.join(" | ")}
      />
      {topCrossings.length === 0 ? (
        <Detail label="top crossings" value="none yet" />
      ) : (
        topCrossings.map((memory, index) => (
          <Detail
            key={`${memory.crossingTileA}:${memory.crossingTileB}`}
            label={`crossing ${index + 1}`}
            value={`${memory.crossingClass} ${memory.crossingTileA} <> ${memory.crossingTileB} uses=${memory.useCount} c=${formatNumber(
              memory.successConfidence,
            )} risk=${formatNumber(memory.riskMemory)}`}
          />
        ))
      )}
    </>
  );
}

export function comparePlaceMemories(left: PlaceMemoryRecord, right: PlaceMemoryRecord): number {
  const leftScore = left.attachment + left.visitCount * 0.05 + (left.isReturnPlace ? 0.25 : 0);
  const rightScore = right.attachment + right.visitCount * 0.05 + (right.isReturnPlace ? 0.25 : 0);

  return rightScore === leftScore
    ? String(left.tileId).localeCompare(String(right.tileId))
    : rightScore - leftScore;
}

export function compareCrossingMemories(left: KnownCrossingMemory, right: KnownCrossingMemory): number {
  if (right.useCount !== left.useCount) {
    return right.useCount - left.useCount;
  }

  return `${left.crossingTileA}:${left.crossingTileB}`.localeCompare(
    `${right.crossingTileA}:${right.crossingTileB}`,
  );
}

export function compareBiomeRecords(left: BiomeCompetenceRecord, right: BiomeCompetenceRecord): number {
  const leftScore = left.competence + left.familiarity * 0.6 + left.successfulUseTicks * 0.02;
  const rightScore = right.competence + right.familiarity * 0.6 + right.successfulUseTicks * 0.02;

  return rightScore === leftScore
    ? left.biomeKind.localeCompare(right.biomeKind)
    : rightScore - leftScore;
}

export function DecisionAlternative({
  alternative,
  index,
}: {
  readonly alternative: AlternativeConsidered;
  readonly index: number;
}) {
  return (
    <div className="decision-card">
      <div className="decision-card-title">
        <span>{index === 0 ? "chosen" : "alternative"}</span>
        <strong>{formatAction(alternative.action)}</strong>
      </div>
      <Detail label="score" value={formatNumber(alternative.score)} />
      {alternative.rejectionReason === undefined ? null : (
        <Detail label="rejected because" value={formatReason(alternative.rejectionReason)} />
      )}
      <div className="score-grid" aria-label="Decision score breakdown">
        {SCORE_FIELDS.map((field) => (
          <span key={field.key}>
            {field.label}: {formatNumber(alternative.scoreBreakdown[field.key])}
          </span>
        ))}
      </div>
    </div>
  );
}


export function countBy<TItem>(
  items: readonly TItem[],
  getKey: (item: TItem) => string,
): Readonly<Record<string, number>> {
  const counts: Record<string, number> = {};

  for (const item of items) {
    const key = getKey(item);
    counts[key] = (counts[key] ?? 0) + 1;
  }

  return counts;
}

export function formatCounts(counts: Readonly<Record<string, number>>): string {
  const entries = Object.entries(counts).sort(([left], [right]) => left.localeCompare(right));

  if (entries.length === 0) {
    return "none";
  }

  return entries.map(([key, value]) => `${key} ${value}`).join(", ");
}

export function formatNumber(value: number): string {
  return value.toFixed(2);
}

function formatSigned(value: number): string {
  return `${value >= 0 ? "+" : ""}${formatNumber(value)}`;
}

export function formatPopulation(value: number): string {
  return String(Math.max(0, Math.round(value)));
}

export function formatOptionalNumber(value: number | undefined): string {
  return value === undefined ? "n/a" : formatNumber(value);
}

export function getPressureScoreSummary(score: ScoreBreakdown): string {
  return `food=${formatNumber(score.foodStress)} water=${formatNumber(
    score.waterStress,
  )} use=${formatNumber(score.localUsePressure)} move=${formatNumber(
    score.netMovePressure,
  )} recovery=${formatNumber(score.recoveryBenefit)} depletion=${formatNumber(
    score.depletionPenalty,
  )} riverCost=${formatNumber(score.riverCrossingCost)} riverRisk=${formatNumber(
    score.riverCrossingRisk,
  )} crowd=${formatNumber(score.nearbyBandPressure)} disperse=${formatNumber(
    score.daughterDispersalPressure,
  )} sat=${formatNumber(score.rangeSaturation)} opp=${formatNumber(
    score.knownOpportunityPull,
  )} scout=${formatNumber(score.scoutValue)} refuge=${formatNumber(
    score.waterRefugeSecurity,
  )} encounter=${formatNumber(score.encounterTension)} biomeMismatch=${formatNumber(score.biomeMismatchPenalty)}`;
}

export function getCombinedUsePressure(pressure: LocalUsePressureRecord | undefined): number {
  if (pressure === undefined) {
    return 0;
  }

  return Math.max(
    pressure.foragingPressure,
    pressure.waterPressure,
    pressure.aquaticPressure,
    pressure.recentUseIntensity * 0.65,
  );
}

export function getBandCrossingCapability(band: Band) {
  const practicedCrossing = Object.values(band.crossingMemories).some((memory) =>
    memory.useCount >= 2 && memory.successConfidence >= 0.5);
  const aquaticPractice = (band.recentIntraSeasonTrips ?? []).filter((trip) =>
    trip.taskGroupType === "fishing_group" || trip.taskGroupType === "water_group").length >= 3;
  const engineering = (band.practicalAdaptation?.responses ?? []).some((response) =>
    response.family === "engineering_structure" && (response.status === "forming" || response.status === "active"));
  const subjects = new Set((band.practicalAdaptation?.fragments ?? []).map((fragment) => fragment.subject));

  return {
    canUseFords: true,
    canUseShallowCrossings: practicedCrossing || aquaticPractice || engineering,
    canAttemptBasicRaftCrossing: engineering && subjects.has("buoyancy_under_load") &&
      subjects.has("binding_under_load") && subjects.has("staged_shuttle_crossing"),
  };
}

export function isRiverReason(reasonType: Reason["type"]): boolean {
  return [
    "river_crossing_cost",
    "river_crossing_blocked",
    "used_known_ford",
    "discovered_ford",
    "avoided_deep_channel",
    "followed_river_corridor",
    "flood_season_crossing_risk",
    "riverbank_continuity",
    "estuary_resource_pull",
    "marsh_channel_slowdown",
    "confluence_attractor",
    "seasonal_stream_opportunity",
  ].includes(reasonType);
}

export function isCrowdingReason(reasonType: Reason["type"]): boolean {
  return [
    "nearby_band_crowding",
    "parent_core_overlap",
    "daughter_dispersal_pressure",
    "inherited_familiarity_pull",
    "safe_frontier_pull",
    "crowding_reduced_local_suitability",
    "split_group_sought_new_range",
    "overlap_tolerated_low_pressure",
  ].includes(reasonType);
}

export function formatAction(action: Action): string {
  if (action.type === "stay") {
    return `stay @ ${action.tileId}`;
  }

  if (action.type === "move_to_tile") {
    return `move_to_tile -> ${action.targetTileId}`;
  }

  if (action.type === "explore_unknown_neighbor") {
    return `explore_unknown_neighbor ${action.fromTileId} -> ${action.targetTileId}`;
  }

  if (action.type === "logistical_probe") {
    return `logistical_probe ${action.originTileId} -> ${action.targetTileId}`;
  }

  return action.type;
}

export function formatReason(reason: Reason): string {
  return `${reason.type} s=${formatNumber(reason.strength)} c=${formatNumber(reason.confidence)}`;
}

export function formatDirection(direction: { readonly x: number; readonly y: number }): string {
  return `${formatNumber(direction.x)}, ${formatNumber(direction.y)}`;
}

export function formatMoodShares(
  moodShares: readonly {
    readonly mood: string;
    readonly share: number;
  }[],
): string {
  return moodShares
    .filter((entry) => entry.share >= 0.06)
    .map((entry) => `${Math.round(entry.share * 100)}% ${entry.mood}`)
    .join(", ") || "none";
}

export function formatResponseShares(
  responseShares: readonly {
    readonly response: string;
    readonly share: number;
  }[],
): string {
  return responseShares
    .filter((entry) => entry.share >= 0.06)
    .map((entry) => `${Math.round(entry.share * 100)}% ${entry.response}`)
    .join(", ") || "none";
}
