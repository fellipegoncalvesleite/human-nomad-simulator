import type { Band } from "../../sim/agents/types";
import { deriveBandChronicle } from "../../sim/agents/bandChronicle";
import { deriveBandTendencies } from "../../sim/agents/bandTendency";
import { deriveChronicHardship } from "../../sim/agents/chronicHardship";
import { deriveCrossingPracticeRelief } from "../../sim/agents/crossingPractice";
import { effectiveFragmentStrength } from "../../sim/agents/practicalFragments";
import { deriveCarryingRelief, deriveDryRouteWaterRelief, deriveEngineeringSafetyRelief } from "../../sim/agents/practicalResponses";
import { classifyResidentialSeason, deriveSeasonalTravelPlanForBand } from "../../sim/agents/migrationWalk";
import { deriveBandIdentityProfile } from "../../sim/agents/bandIdentity";
import { deriveCanonicalEvents, familyLabel } from "../../sim/agents/eventSystem";
import { deriveKnowledgeEcologyProfile } from "../../sim/agents/knowledgeEcology";
import {
  deriveKnowledgeCarrierProfile,
  knowledgeAvailabilityLabel,
  knowledgeCarrierClassLabel,
  knowledgeCarrierDomainLabel,
} from "../../sim/agents/knowledgeCarriers";
import {
  deriveMaterialAffordanceProfile,
  materialAffordanceFamilyLabel,
  materialAffordanceStatusLabel,
} from "../../sim/agents/materialAffordance";
import {
  candidateFamilyLabel,
  deriveProblemPracticeProfile,
  practiceExperimentStatusLabel,
  practiceFeedbackTypeLabel,
  problemFrameFamilyLabel,
} from "../../sim/agents/problemPractice";
import {
  campFootholdFactorFamilyLabel,
  campFootholdStatusLabel,
  deriveCampFootholdProfile,
} from "../../sim/agents/campFoothold";
import {
  derivePracticeFeedbackReadinessProfile,
  practiceFeedbackQualityLabel,
  practiceFeedbackReadinessFamilyLabel,
  practiceFeedbackReadinessFeedbackTypeLabel,
  practiceFeedbackReadinessStatusLabel,
} from "../../sim/agents/practiceFeedbackReadiness";
import {
  deriveSocialEcologicalDiffusionProfile,
  socialDiffusionChannelLabel,
  socialDiffusionCompatibilityLabel,
  socialDiffusionDomainLabel,
  socialDiffusionStatusLabel,
  socialDiffusionTacitDifficultyLabel,
  socialDiffusionTrustFilterLabel,
} from "../../sim/agents/socialEcologicalDiffusion";
import {
  adaptiveAttemptOutcomeLabel,
  adaptiveIdeaFamilyLabel,
  adaptiveResponseTypeLabel,
  deriveAdaptiveHumanProfile,
} from "../../sim/agents/adaptiveHuman";
import { deriveCampMovementProfile } from "../../sim/agents/campMovement";
import { deriveMemoryReferents } from "../../sim/agents/memoryReferents";
import { derivePublicHumanStoryProfile } from "../../sim/agents/publicHumanStory";
import type { Decision } from "../../sim/rules/types";
import type { Tile, WorldState } from "../../sim/world/types";

import {
  bandStatusLabel,
  mobilityLabel,
  subsistenceLabel,
  technologyLabel,
} from "../labels";
import { useSimulationStore } from "../../store";
import { formatWorldEcology } from "../ecologyView";
import { CollapsibleGroup, Detail } from "./parts";
import {
  ActivityTraceDetails,
  AcuteRiskDetails,
  BandConditionProfileDetails,
  BandEventHistoryDetails,
  BandViabilityDetails,
  BodyCampLogisticsDetails,
  ResidentialMoveTraceDetails,
  CampRumorReadabilityDetails,
  CarryingCapacityDetails,
  CausalPressureDetails,
  CrowdingDetails,
  DeathMemoryDetails,
  DemographicChurnDetails,
  DaughterInheritanceDetails,
  DemographyFissionDetails,
  DryMarginDetails,
  EncounterContactDetails,
  FamiliarCountryDetails,
  ForagingAdaptationDetails,
  InnerFissionDetails,
  KnowledgeDetails,
  LineageReadabilityDetails,
  LineageIdentityDetails,
  LineageInheritedRangeDetails,
  KnownNeighbouringRangesDetails,
  MobilityBehaviorBasisDetails,
  NoDeathAuditDetails,
  OutwardEstablishmentDetails,
  PlantPatchTruthDetails,
  ProtoAccessDetails,
  ProtoCampDetails,
  RangeFrontierOpportunityDetails,
  RangeFrictionDetails,
  ReportedKnowledgeDetails,
  RelationshipMemoryDetails,
  ResourceEcologyDetails,
  VisibleNatureDetails,
  SeasonalEcologyDetails,
  SeasonalSupportDetails,
  SeasonalRoundDetails,
  SocialTensionDetails,
  SpawnReasonDetails,
  VisibleLandscapeDetails,
} from "./sections";

// The Technical tab preserves the full raw engineering data verbatim, only
// reorganized into collapsed groups. It keeps the existing in-component sim
// read-derivations (status quo); the player-facing tabs do not.
// SIM-TOOLS-1 — world-TRUTH ecology aggregate. This is an EXPLICIT DEBUG view
// (whole-map truth), strictly separate from the player-facing "Ecology they know"
// card (which shows only the selected band's own discovered knowledge). The truth
// summary is computed sim-side and rides the snapshot; it never feeds sim behaviour.
function WorldEcologyDebugDetails() {
  const ecologySummary = useSimulationStore((state) => state.ecologySummary);

  if (ecologySummary === null) {
    return <Detail label="ecology" value="(no world loaded)" />;
  }

  const dashboard = formatWorldEcology(ecologySummary);

  return (
    <>
      <Detail label="overall ecological pressure" value={dashboard.pressure} />
      <Detail label={dashboard.wildlife.label} value={`${dashboard.wildlife.category} · ${dashboard.wildlife.detail}`} />
      <Detail label={dashboard.aquatic.label} value={`${dashboard.aquatic.category} · ${dashboard.aquatic.detail}`} />
      <Detail label={dashboard.plants.label} value={`${dashboard.plants.category} · ${dashboard.plants.detail}`} />
      <Detail
        label="fauna categories"
        value={`rich ${ecologySummary.fauna.rich} · decent ${ecologySummary.fauna.decent} · poor ${ecologySummary.fauna.poor} · depleted ${ecologySummary.fauna.depleted} · recovering ${ecologySummary.fauna.recovering}`}
      />
      <Detail
        label="aquatic categories"
        value={`rich ${ecologySummary.aquatic.rich} · decent ${ecologySummary.aquatic.decent} · poor ${ecologySummary.aquatic.poor} · depleted ${ecologySummary.aquatic.depleted} · recovering ${ecologySummary.aquatic.recovering}`}
      />
      <Detail
        label="plant patches (worked)"
        value={`${ecologySummary.plant.dynamicRecords} records · ${ecologySummary.plant.overharvested} overharvested · ${ecologySummary.plant.heavilyOverharvested} heavy · mean depletion ${ecologySummary.plant.meanDepletion}`}
      />
      <Detail
        label="fauna routine phases (world truth)"
        value={Object.entries(ecologySummary.faunaRoutines.phases).map(([phase, count]) => `${phase} ${count}`).join(" · ") || "none"}
      />
      <Detail
        label="fauna response state (world truth)"
        value={`${ecologySummary.faunaRoutines.managedStocks} contact-affected stocks · wariness ${ecologySummary.faunaRoutines.meanWariness} · habituation ${ecologySummary.faunaRoutines.meanHabituation} · reproductive condition ${ecologySummary.faunaRoutines.meanReproductiveCondition}`}
      />
      <Detail
        label="trophic coupling (world truth)"
        value={`${ecologySummary.trophic.herbivoreStocks} forage consumers · forage ratio ${ecologySummary.trophic.meanForageSupportRatio} · feeding ${ecologySummary.trophic.feedingPressure} · ${ecologySummary.trophic.predatorStocks} predators · prey removed ${ecologySummary.trophic.preyRemoved} · predator condition ${ecologySummary.trophic.meanPredatorCondition}`}
      />
    </>
  );
}

function PerformancePayloadDetails({ band, world }: { readonly band: Band; readonly world: WorldState | null }) {
  const selectedProjection = useSimulationStore((state) => state.selectedBandPanelProjection);
  const liveOverlay = useSimulationStore((state) => state.liveOverlay);
  const matchingProjection =
    selectedProjection !== null && selectedProjection.selectedBandId === String(band.id)
      ? selectedProjection
      : null;
  const selectedBandBytes = estimateJsonBytes(band);
  const liveProjectionBytes = estimateJsonBytes(matchingProjection ?? {});
  const liveOverlayBytes = estimateJsonBytes(liveOverlay ?? {});
  const dynamicSnapshotBytes =
    world === null
      ? 0
      : estimateJsonBytes({
          time: world.time,
          bands: world.bands,
          decisions: world.decisions,
          decisionArchive: world.decisionArchive,
          currentClimateStress: world.currentClimateStress,
          tileDepletion: world.tileDepletion,
        });
  const storyStart = performance.now();
  const storyProfile = world === null ? null : derivePublicHumanStoryProfile(world, band);
  const storyDerivationMs = performance.now() - storyStart;
  const storyBytes = estimateJsonBytes(storyProfile ?? {});
  const storyItemCount = storyProfile?.items.length ?? 0;
  const storyEvidenceRefs =
    storyProfile?.items.reduce(
      (total, item) => total + item.evidenceChips.length + item.sourceRefs.length,
      0,
    ) ?? 0;
  const latestDecisionId = band.decisionHistory[band.decisionHistory.length - 1];
  const latestDecision =
    world === null || latestDecisionId === undefined
      ? undefined
      : world.decisions[latestDecisionId];
  const latestAlternativeCount = latestDecision?.alternativesConsidered.length ?? 0;
  const latestCoreBreadth = latestDecision?.coreDeliberationBreadth ?? 0;
  const projectionDiagnostics = matchingProjection?.diagnostics;
  const compactReduction =
    projectionDiagnostics === undefined || projectionDiagnostics.rawBandBytesEstimate === 0
      ? "n/a"
      : `${Math.round((1 - projectionDiagnostics.compactBandBytesEstimate / projectionDiagnostics.rawBandBytesEstimate) * 100)}%`;
  const largestLists = [
    { label: "reports", count: band.reportedKnowledge?.reports.length ?? 0 },
    { label: "speculations", count: band.reportedKnowledge?.speculations?.length ?? 0 },
    { label: "events", count: band.eventHistory?.recentEvents.length ?? 0 },
    { label: "event window 10y", count: band.eventHistory?.last10Years.length ?? 0 },
    { label: "event window 25y", count: band.eventHistory?.last25Years.length ?? 0 },
    { label: "camp talk", count: band.campRumors?.items.length ?? 0 },
    { label: "movement history", count: band.movementHistory.length },
    { label: "residential moves", count: band.recentResidentialMoveEvents?.length ?? 0 },
    { label: "recent trips", count: band.recentIntraSeasonTrips?.length ?? 0 },
  ]
    .sort((left, right) => right.count - left.count)
    .slice(0, 5)
    .map((entry) => `${entry.label} ${entry.count}`)
    .join(" · ");
  const panelPayloads = {
    overview:
      estimateJsonBytes(band.conditionProfile ?? {}) +
      estimateJsonBytes(band.campRumors ?? {}) +
      estimateJsonBytes(band.relationshipMemory ?? {}) +
      estimateJsonBytes(band.bodyCampLogistics ?? {}),
    nature:
      estimateJsonBytes(band.visibleNature ?? {}) +
      estimateJsonBytes(band.resourceEcology?.storageSuitabilityCards ?? []) +
      estimateJsonBytes(band.foragingAdaptation ?? {}) +
      estimateJsonBytes(band.relationshipMemory ?? {}),
    history:
      estimateJsonBytes(band.eventHistory ?? {}) +
      estimateJsonBytes(band.movementHistory ?? []) +
      estimateJsonBytes(band.recentResidentialMoveEvents ?? []) +
      estimateJsonBytes(band.travelCorridors ?? {}),
    technicalRaw: selectedBandBytes,
  };

  return (
    <>
      <Detail label="selected-band raw payload" value={`${formatBytes(selectedBandBytes)} estimated JSON`} />
      <Detail
        label="selected-band live payload"
        value={`${formatBytes(liveProjectionBytes)} transfer estimate · mode ${matchingProjection?.detailMode ?? "snapshot"} · reduction ${compactReduction}`}
      />
      <Detail
        label="worker/main-thread payload"
        value={`live overlay ${formatBytes(liveOverlayBytes)} · dynamic snapshot ${formatBytes(dynamicSnapshotBytes)} estimated JSON`}
      />
      <Detail
        label="public story payload"
        value={`${formatBytes(storyBytes)} · ${storyItemCount} items · ${storyEvidenceRefs} evidence/source refs · ${storyDerivationMs.toFixed(2)} ms derived on Technical expansion`}
      />
      <Detail
        label="panel payload estimates"
        value={`overview ${formatBytes(panelPayloads.overview)} · nature ${formatBytes(panelPayloads.nature)} · history ${formatBytes(panelPayloads.history)} · technical raw ${formatBytes(panelPayloads.technicalRaw)}`}
      />
      <Detail
        label="largest selected-band lists"
        value={largestLists.length === 0 ? "none" : largestLists}
      />
      <Detail
        label="projection caps"
        value={
          projectionDiagnostics === undefined
            ? "live summary not available"
            : `trips ${projectionDiagnostics.caps.recentTrips} · activity path ${projectionDiagnostics.caps.activityPathTiles} · residential moves ${projectionDiagnostics.caps.residentialMoves} · events ${projectionDiagnostics.caps.eventHistory} · camp talk ${projectionDiagnostics.caps.campTalk}`
        }
      />
      <Detail
        label="projection cache key"
        value={projectionDiagnostics?.projectionKey ?? "waiting for live selected-band projection"}
      />
      <Detail
        label="event/talk counts"
        value={`events ${band.eventHistory?.recentEvents.length ?? 0} · camp talk ${band.campRumors?.items.length ?? 0} · reports ${band.reportedKnowledge?.reports.length ?? 0} · speculations ${band.reportedKnowledge?.speculations?.length ?? 0}`}
      />
      <Detail
        label="nature/debug counts"
        value={`fauna ${band.visibleNature?.faunaCards.length ?? 0} · plants ${band.visibleNature?.plantCards.length ?? 0} · aquatic ${band.visibleNature?.aquaticCards.length ?? 0} · forest ${band.visibleNature?.forestCards.length ?? 0} · storage ${band.resourceEcology?.storageSuitabilityCards.length ?? 0}`}
      />
      <Detail
        label="recent substrate counts"
        value={`camp ${band.protoCampMemory?.topPlaces.length ?? 0} · access ${band.protoAccessMemory?.topPlaces.length ?? 0} · body weather ${band.bodyCampLogistics?.weatherMemories.length ?? 0} · relationship practice ${band.relationshipMemory?.practiceSkills.length ?? 0} · failures ${band.relationshipMemory?.failureStories.length ?? 0}`}
      />
      <Detail
        label="derivation policy"
        value="public tabs mount one active panel; Technical and markdown export derive raw proof on demand"
      />
      <Detail
        label="closed-tab derivations avoided"
        value="inactive band tabs are unmounted; hidden markdown export source is unmounted until Generate .md"
      />
      <Detail
        label="movement hot-path diagnostics"
        value="benchmark phases exposed: movementDecisionAndPressure · movement:candidateGeneration · movement:candidatePassabilityChecks · context:carryingCapacity · context:rangeSaturationState · context:frontierKnowledge"
      />
      <Detail
        label="movement cache/index proof"
        value="WorldTime seasonal tile cache · static map relief-radius cache · static map fallback catchment-ring cache · directed river-crossing cache · seasonal crossing-state cache · per-tick non-dispersed band count"
      />
      <Detail
        label="candidate caps / dedupe status"
        value={`latest alternatives ${latestAlternativeCount} · core breadth ${latestCoreBreadth} · dedupe not applied in behavior path; action/reason ordering preserved`}
      />
    </>
  );
}

function BandChronicleDetails({ band, world }: { readonly band: Band; readonly world: WorldState | null }) {
  if (world === null) {
    return <Detail label="band chronicle" value="world unavailable" />;
  }

  const chronicle = deriveBandChronicle(world, band);
  const proof = chronicle.technicalProof;

  return (
    <>
      <Detail label="headline" value={chronicle.headline} />
      <Detail label="current era" value={chronicle.currentEra} />
      <Detail
        label="counts"
        value={`years ${chronicle.yearlyEntries.length}/${proof.yearlyEntryCap} · arcs ${chronicle.majorArcs.length}/${proof.majorArcCap} · events ${chronicle.majorEvents.length}/${proof.majorEventCap} · links ${chronicle.linkTargets.length}/${proof.linkTargetCap}`}
      />
      <Detail
        label="source counts"
        value={`events ${proof.sourceEventCount} · talk items ${proof.sourceTalkItemCount} · talk ledger ${proof.sourceTalkLedgerCount}`}
      />
      <Detail label="payload estimate" value={`${formatBytes(proof.payloadBytesEstimate)} selected-band projection`} />
      <Detail
        label="guards"
        value={`selectedBandOnly=${proof.selectedBandOnly} · bounded=${proof.bounded} · hiddenMapTruthUsed=${proof.antiOmniscience.hiddenMapTruthUsed} · hiddenBandTruthUsed=${proof.antiOmniscience.hiddenBandTruthUsed}`}
      />
      <Detail
        label="dropped by cap"
        value={`years ${proof.droppedByCap.yearlyEntries} · arcs ${proof.droppedByCap.majorArcs} · events ${proof.droppedByCap.majorEvents} · links ${proof.droppedByCap.linkTargets} · episodes ${proof.droppedByCap.episodes} · pages ${proof.droppedByCap.pages}`}
      />
      <Detail
        label="wiki pages"
        value={`total ${chronicle.pages.length} · year ${proof.pageCountsByKind.year} · period ${proof.pageCountsByKind.period} · event ${proof.pageCountsByKind.event} · referent ${proof.pageCountsByKind.referent} · place ${proof.pageCountsByKind.place} · route ${proof.pageCountsByKind.route} · resource ${proof.pageCountsByKind.resource}`}
      />
      <Detail
        label="link graph"
        value={`nodes ${proof.linkGraph.nodeCount} · edges ${proof.linkGraph.edgeCount} · broken ${proof.linkGraph.brokenLinkCount} · unresolved dropped ${proof.linkGraph.unresolvedDroppedCount}`}
      />
      <Detail
        label="template variation"
        value={`${proof.templateVariationCount} distinct template keys · sample ${proof.templateKeysUsed.slice(0, 6).join(", ") || "none"}`}
      />
      <Detail label="future hooks reserved" value={proof.futureHooksReserved.join(" | ")} />
      {proof.episodeProof.length === 0 ? (
        <Detail label="episode proof" value="none" />
      ) : (
        proof.episodeProof.slice(0, 8).map((entry) => (
          <Detail
            key={entry.episodeId}
            label={entry.episodeId}
            value={`category ${entry.category} · occurrences ${entry.occurrenceCount} · events ${entry.sourceEventIds.join(", ") || "none"}`}
          />
        ))
      )}
      {proof.pageProof.length === 0 ? (
        <Detail label="page proof" value="none" />
      ) : (
        proof.pageProof.slice(0, 12).map((entry) => (
          <Detail
            key={entry.pageId}
            label={entry.pageId}
            value={`kind ${entry.kind} · paragraphs ${entry.paragraphCount} · related links ${entry.relatedLinkCount}`}
          />
        ))
      )}
      {proof.yearProof.length === 0 ? (
        <Detail label="year proof" value="none" />
      ) : (
        proof.yearProof.slice(0, 8).map((entry) => (
          <Detail
            key={entry.id}
            label={`year ${entry.yearRange}`}
            value={`compressed=${entry.compressed} · signals ${entry.dominantSignals.join(", ")} · events ${entry.sourceEventIds.join(", ") || "none"} · talk ${entry.sourceTalkIds.join(", ") || "none"} · reasons ${entry.sourceReasonIds.join(", ") || "none"}`}
          />
        ))
      )}
      {proof.arcProof.length === 0 ? (
        <Detail label="arc proof" value="none" />
      ) : (
        proof.arcProof.map((entry) => (
          <Detail
            key={entry.arcId}
            label={entry.arcId}
            value={`kind ${entry.kind} · score ${entry.score} · events ${entry.sourceEventIds.join(", ") || "none"} · talk ${entry.sourceTalkIds.join(", ") || "none"} · reasons ${entry.sourceReasonIds.join(", ") || "none"} · scoring ${entry.scoringReasons.join(" | ")}`}
          />
        ))
      )}
      {proof.eventProof.length === 0 ? (
        <Detail label="event proof" value="none" />
      ) : (
        proof.eventProof.slice(0, 8).map((entry) => (
          <Detail
            key={entry.eventId}
            label={entry.eventId}
            value={`category ${entry.category} · salience ${entry.salience} · score ${entry.score} · reasons ${entry.scoringReasons.join(" | ")} · source ids ${entry.sourceReasonIds.join(", ") || "none"}`}
          />
        ))
      )}
    </>
  );
}

function MemoryReferentDetails({ band, world }: { readonly band: Band; readonly world: WorldState | null }) {
  if (world === null) {
    return <Detail label="memory referents" value="world unavailable" />;
  }

  const state = deriveMemoryReferents(world, band);
  const proof = state.technicalProof;
  const counts = Object.entries(state.byKindCounts)
    .filter(([, count]) => count > 0)
    .map(([kind, count]) => `${kind} ${count}`)
    .join(" · ");

  return (
    <>
      <Detail label="referents" value={`${state.referents.length}/${state.caps.totalReferentCap} selected-band projection`} />
      <Detail label="by kind" value={counts.length === 0 ? "none" : counts} />
      <Detail label="payload estimate" value={`${formatBytes(proof.payloadBytesEstimate)} selected-band projection`} />
      <Detail
        label="caps"
        value={`perKind ${state.caps.perKindCap} · relatedIds ${state.caps.relatedIdCap} · proofIds ${state.caps.proofIdCap} · droppedKind ${state.caps.droppedByKindCap} · droppedTotal ${state.caps.droppedByTotalCap}`}
      />
      <Detail
        label="source counts"
        value={`weather ${proof.sourceCounts.weatherMemories} · gear ${proof.sourceCounts.materialWear} · fallback ${proof.sourceCounts.fallbackCandidates} · resourcePlaces ${proof.sourceCounts.resourcePlaceMemories} · nature ${proof.sourceCounts.visibleNatureCards} · acute ${proof.sourceCounts.acuteRiskEpisodes} · camps ${proof.sourceCounts.campPlaces} · access ${proof.sourceCounts.accessPlaces} · routes ${proof.sourceCounts.routes} · crossings ${proof.sourceCounts.crossings} · talk ${proof.sourceCounts.talkItems} · events ${proof.sourceCounts.events}`}
      />
      <Detail
        label="guards"
        value={`selectedBandOnly=${state.antiOmniscience.selectedBandOnly} · bandKnownOnly=${state.antiOmniscience.fromBandKnownInputsOnly} · hiddenMapTruthUsed=${state.antiOmniscience.hiddenMapTruthUsed} · hiddenBandTruthUsed=${state.antiOmniscience.hiddenBandTruthUsed}`}
      />
      <Detail label="compressed notices" value={state.compressedNotices.join(" | ") || "none"} />
      {proof.proof.length === 0 ? (
        <Detail label="referent proof" value="none" />
      ) : (
        proof.proof.slice(0, 12).map((entry, index) => (
          <Detail
            key={`${entry.sourceKind}-${index}`}
            label={`referent ${index + 1}`}
            value={`kind ${entry.sourceKind} · score ${entry.score} · rawSources ${entry.rawSourceLabels.join(", ") || "none"} · rawIds ${entry.rawIds.join(", ") || "none"} · events ${entry.sourceEventIds.join(", ") || "none"} · talk ${entry.sourceTalkIds.join(", ") || "none"} · reasons ${entry.sourceReasonIds.join(", ") || "none"} · scoring ${entry.scoringReasons.join(" | ")}`}
          />
        ))
      )}
    </>
  );
}

// CAUSAL-REPAIR-1 proof block: the exact hardship signal, tendency vector,
// founder/daughter dispersal pressure, and per-crossing practice relief the
// decision actually consumed — plus the latest decision's candidate roster.
// Derived on demand from the same pure functions the sim uses; no extra state.
function CausalAgencyDetails({
  band,
  world,
  latestDecision,
}: {
  readonly band: Band;
  readonly world: WorldState | null;
  readonly latestDecision: Decision | undefined;
}) {
  const tendencies = deriveBandTendencies(band);
  const hardship = deriveChronicHardship(band, tendencies);
  const currentTick = world === null ? 0 : Number(world.time.tick);
  const travelPlan = deriveSeasonalTravelPlanForBand(
    band,
    band.currentIntent?.kind,
    band.currentIntent?.persistence ?? 0,
    currentTick,
  );
  const lastMove = band.movementHistory[band.movementHistory.length - 1];
  const lastMoveDistance = lastMove === undefined || world === null
    ? undefined
    : (() => {
        const fromTile = world.tiles[lastMove.fromTileId];
        const toTile = world.tiles[lastMove.toTileId];
        return fromTile === undefined || toTile === undefined
          ? undefined
          : Math.abs(fromTile.coord.x - toTile.coord.x) + Math.abs(fromTile.coord.y - toTile.coord.y);
      })();
  const lastMoveSummary = lastMove === undefined
    ? "no residential move recorded"
    : `${String(lastMove.fromTileId)} → ${String(lastMove.toTileId)} · ${lastMoveDistance ?? "?"} tile(s) · ${Math.max(0, currentTick - Number(lastMove.tick))} season(s) ago${(lastMoveDistance ?? 0) >= 2 ? " · staged seasonal travel" : ""}`;
  const movedThisSeason = lastMove !== undefined && currentTick - Number(lastMove.tick) <= 1;
  const bestMoveAlternative = latestDecision?.alternativesConsidered.find(
    (alternative) => alternative.action.type === "move_to_tile" || alternative.action.type === "explore_unknown_neighbor",
  );
  const seasonClass = classifyResidentialSeason({
    movedThisSeason,
    moveDistance: movedThisSeason ? lastMoveDistance ?? 0 : 0,
    planMotive: travelPlan.motive,
    planEngaged: travelPlan.engaged,
    anchorRecommendation: band.anchorDecision?.chosenResidentialAction,
    blockedCrossingOnBestMove: (bestMoveAlternative?.scoreBreakdown.blockedCrossingPenalty ?? 0) >= 1,
  });
  const crossingEntries = Object.entries(band.crossingMemories)
    .map(([key, memory]) => ({ key, memory, practice: deriveCrossingPracticeRelief(memory, currentTick) }))
    .sort((left, right) => right.practice.relief - left.practice.relief)
    .slice(0, 4);
  const anchor = band.anchorDecision;
  const stayBlocker = anchor === undefined
    ? "no anchor decision"
    : [
        anchor.waterFailureGate ? "water failure gate open" : undefined,
        anchor.foodCollapseGate ? "food collapse gate open" : undefined,
        anchor.betterKnownRefugeGate ? "better known refuge gate open" : undefined,
        anchor.riskGate ? "risk gate open" : undefined,
        anchor.fatigueGate ? "fatigue gate open" : undefined,
      ].filter((entry): entry is string => entry !== undefined).join(" · ") ||
      `anchor recommends ${anchor.chosenResidentialAction} (no gate open)`;
  const candidateSummary = latestDecision === undefined
    ? "no decision archived"
    : latestDecision.alternativesConsidered
        .slice(0, 6)
        .map((alternative) => `${alternative.action.type} ${formatCompactNumber(alternative.score)}`)
        .join(" · ");

  return (
    <>
      <Detail
        label="hardship signal"
        value={`severity ${formatCompactNumber(hardship.severity)} · ${hardship.active ? "ACTIVE" : "inactive"} · lowReturn ${formatCompactNumber(hardship.lowReturnEvidence)} · saturation ${formatCompactNumber(hardship.saturationEvidence)} · foodStress ${formatCompactNumber(hardship.foodStressEvidence)} · dwell ×${formatCompactNumber(hardship.dwellEscalation)}`}
      />
      <Detail
        label="hardship effects"
        value={`stay-bias erosion ${formatCompactNumber(hardship.stayBiasErosion)} (cap 0.6) · move-pressure boost ${formatCompactNumber(hardship.movePressureBoost)} (cap 0.18) · scout urgency ${formatCompactNumber(hardship.scoutUrgency)} (cap 0.14)`}
      />
      <Detail
        label="pressure escalation applied"
        value={`pressureState.chronicHardshipEscalation ${formatCompactNumber(band.pressureState?.chronicHardshipEscalation ?? 0)} · netMovePressure ${formatCompactNumber(band.pressureState?.netMovePressure ?? 0)}`}
      />
      <Detail
        label="stay blocker / hold reason"
        value={stayBlocker}
      />
      <Detail
        label="tendency vector"
        value={`explore ${formatCompactNumber(tendencies.exploration)} · attach ${formatCompactNumber(tendencies.attachment)} · crossCaution ${formatCompactNumber(tendencies.crossingCaution)} · campShift ${formatCompactNumber(tendencies.campShiftWillingness)} · failSens ${formatCompactNumber(tendencies.failureSensitivity)} · routine ${formatCompactNumber(tendencies.routineReliance)} (each ±1, use-site caps ≤±15%)`}
      />
      <Detail
        label="dispersal pressure"
        value={`${band.parentBandId === undefined ? "founder" : "daughter"} · daughterDispersalPressure ${formatCompactNumber(band.pressureState?.daughterDispersalPressure ?? 0)} · sustainedOverCapacity ${formatCompactNumber(band.carryingCapacity?.perCapitaReturn.sustainedOverCapacity ?? 0)}`}
      />
      <Detail
        label="crossing practice"
        value={crossingEntries.length === 0
          ? "no crossing memories — relief absent"
          : crossingEntries
              .map((entry) =>
                `${entry.key}: relief ${formatCompactNumber(entry.practice.relief)} (cap 0.35) · practice ${formatCompactNumber(entry.practice.practice)} · staleness ${formatCompactNumber(entry.practice.staleness)} · uses ${entry.memory.useCount}`)
              .join(" | ")}
      />
      <Detail
        label="latest candidates"
        value={`${latestDecision === undefined ? 0 : latestDecision.alternativesConsidered.length} considered · ${candidateSummary}`}
      />
      <Detail
        label="seasonal travel plan"
        value={`motive ${travelPlan.motive} (strength ${formatCompactNumber(travelPlan.motiveStrength)}) · budget ${travelPlan.budget} tile(s)/season · ${travelPlan.engaged ? "JOURNEY ENGAGED (staged migration walk)" : "single hop"}`}
      />
      <Detail
        label="travel limiters"
        value={travelPlan.limiters.length === 0 ? "none — journey at full planned range" : travelPlan.limiters.join(" · ")}
      />
      <Detail
        label="residential season class"
        value={`${seasonClass.kind} — ${seasonClass.label} (residential band only; task parties/probes never move the camp)`}
      />
      <Detail
        label="last residential move"
        value={lastMoveSummary}
      />
    </>
  );
}

// INVENTION-1 proof block: the practical-learning substrate — what the band
// has lived through (fragments with basis/strength/staleness), what it
// composed from them (responses with variant, status, confidence, failures,
// revision lineage), which real coefficient the response touches right now
// (current reliefs with their exact gating reason), and the response-specific
// efficacy records the sim wrote when a response was exercised.
function PracticalAdaptationDetails({ band, world }: { readonly band: Band; readonly world: WorldState | null }) {
  const state = band.practicalAdaptation;
  const currentTick = world === null ? 0 : Number(world.time.tick);
  if (state === undefined || (state.fragments.length === 0 && state.responses.length === 0)) {
    return (
      <Detail
        label="practical adaptation"
        value="no learned fragments or practical responses yet — they form only from repeated lived conditions (burden, dry travel) with a real material/technique basis"
      />
    );
  }
  const carrying = deriveCarryingRelief(band, currentTick);
  const water = deriveDryRouteWaterRelief(band, currentTick, undefined);
  const engineering = deriveEngineeringSafetyRelief(band, currentTick, undefined);
  return (
    <>
      <Detail
        label="canonical invention problems"
        value={(state.problems ?? []).length === 0 ? "none" : (state.problems ?? []).map((problem) =>
          `${problem.publicLabel} · ${problem.status} severity ${formatCompactNumber(problem.severity)} confidence ${formatCompactNumber(problem.confidence)} repeated ${problem.repetitionCount} · reading: ${problem.interpretation}${problem.misread ? " (MISREAD)" : ""} · evidence ${problem.evidenceRefs.join(",")}`).join(" | ")}
      />
      <Detail
        label="canonical invention ideas"
        value={(state.ideas ?? []).length === 0 ? "none" : (state.ideas ?? []).map((idea) =>
          `${idea.publicLabel} · ${idea.status} (${idea.statusReason}) · mechanism ${idea.mechanismBelief} · basis ${formatCompactNumber(idea.basisScore)} from ${idea.basisFragmentIds.join(",") || "missing components"} · ${idea.source}`).join(" | ")}
      />
      <Detail
        label="canonical physical experiments"
        value={(state.experiments ?? []).length === 0 ? "none" : (state.experiments ?? []).map((experiment) =>
          `${experiment.family}/${experiment.variantKey} · ${experiment.status} attempts ${experiment.attemptSeasons} · materials ${experiment.materials.join(", ")} · procedure ${experiment.procedure} · cost labor ${formatCompactNumber(experiment.laborCost)} risk ${formatCompactNumber(experiment.riskCost)} / ${experiment.opportunityCost} · expected ${experiment.expectedEffect} · observed ${experiment.observedOutcome ?? "not yet attempted"} · learned ${experiment.fragmentsLearned.join(",") || "none"} contradicted ${experiment.fragmentsContradicted.join(",") || "none"}`).join(" | ")}
      />
      <Detail
        label="local waterworks"
        value={state.waterWorks === undefined ? "none" : `${String(state.waterWorks.tileId)} · ${state.waterWorks.status} · yield ${formatCompactNumber(state.waterWorks.yieldLevel)} · dig seasons ${state.waterWorks.digSeasons} · labor total ${formatCompactNumber(state.waterWorks.laborPaid)} latest ${formatCompactNumber(state.waterWorks.lastLaborCost)} · ${state.waterWorks.outcomeNote}`}
      />
      <Detail
        label="learned fragments"
        value={state.fragments.length === 0
          ? "none"
          : state.fragments
              .map((fragment) =>
                `${fragment.subject} (${fragment.property}) · ${fragment.basis}/${fragment.knowledgeState ?? "legacy"} · strength ${formatCompactNumber(fragment.strength)} eff ${formatCompactNumber(effectiveFragmentStrength(fragment, currentTick))} · observations ${fragment.observationCount ?? 0} contradictions ${fragment.contradictionCount ?? 0} · contexts ${(fragment.contextKeys ?? []).join(",") || "none"} · failures ${fragment.failureCount}`)
              .join(" | ")}
      />
      {state.responses.map((response) => (
        <Detail
          key={response.id}
          label={`response ${response.family}`}
          value={`${response.variantKey} · ${response.status} · confidence ${formatCompactNumber(response.confidence)} · ${response.successCount} success / ${response.partialCount} partial / ${response.failureCount} failure · ${response.lastEfficacy ?? "not yet exercised"} · ${response.contextNote}${response.revisionOf !== undefined ? ` · revised from ${response.revisionOf}` : ""}`}
        />
      ))}
      <Detail
        label="current carrying relief"
        value={`relief ${formatCompactNumber(carrying.relief)} (cap ${formatCompactNumber(carrying.cap)}) · ${carrying.active ? "ACTIVE — applied to travel-plan carry/vulnerable limiters + move-hardship dependent terms" : "inactive"} · ${carrying.reason}`}
      />
      <Detail
        label="current water-route relief"
        value={`relief ${formatCompactNumber(water.relief)} (cap ${formatCompactNumber(water.cap)}) · applied to the travel-plan water limiter only toward a remembered watered destination (target-dependent; this view has no target) · ${water.reason}`}
      />
      <Detail
        label="current crossing-engineering relief"
        value={`safety relief ${formatCompactNumber(engineering.relief)} (cap ${formatCompactNumber(engineering.cap)}) · target/crossing-dependent; this view has no crossing context · ${engineering.reason}`}
      />
      {state.efficacyRecords.map((record) => (
        <Detail
          key={record.id}
          label={`practical efficacy ${record.family} @t${String(record.tick)}`}
          value={`${record.classification} → ${record.outcome} · response ${record.responseId} · ${record.responseActive ? "ACTIVE" : "not active"} · context ${record.contextKey ?? "none"} · coefficient ${record.coefficient} pre ${formatCompactNumber(record.preEffectValue)} effect ${formatCompactNumber(record.effectAmount)} (cap ${formatCompactNumber(record.effectCap)}) · confidence Δ${formatCompactNumber(record.confidenceDelta)} · failures Δ${record.failureDelta} · future influence ${record.futureInfluenceChanged ? "CHANGED" : "unchanged"} · ${record.localityNote} · ${record.reason}`}
        />
      ))}
    </>
  );
}

function AnimalLearningManagementDetails({ band }: { readonly band: Band }) {
  const knowledge = band.animalPatternKnowledge;
  const management = band.animalManagement;
  return (
    <>
      <Detail
        label="persisted animal-pattern knowledge"
        value={knowledge === undefined || knowledge.records.length === 0
          ? "none — current stock truth/cards do not count as learned patterns"
          : knowledge.records.map((record) =>
              `${record.faunaKind}@${String(record.placeTileId)} · ${record.state}/${record.basis} conf ${formatCompactNumber(record.confidence)} · observations ${record.observationCount} direct ${record.directObservationCount} inferred ${record.inferenceCount} contradicted ${record.contradictionCount} · seasons ${record.seasonsObserved.join(",") || "none"} · patterns ${record.patterns.join(",")}`).join(" | ")}
      />
      <Detail
        label="proto-management attempts"
        value={management === undefined || management.records.length === 0
          ? "none — requires repeated direct contact and affordable labor/water/camp cost"
          : management.records.map((record) =>
              `${record.faunaKind}@${String(record.placeTileId)} · ${record.status} ${record.action} → ${record.outcome} · contact ${record.contactSeasons} feed ${record.feedingAttempts} hold ${record.holdingAttempts} +${record.successes}/-${record.failures} · cost labor ${formatCompactNumber(record.laborCost)} water ${formatCompactNumber(record.waterCost)} camp ${formatCompactNumber(record.campCost)} · willingness ${formatCompactNumber(record.willingness)} · tolerance ${formatCompactNumber(record.animalToleranceObserved)} stress ${formatCompactNumber(record.stressObserved)}`).join(" | ")}
      />
      <Detail label="management scope locks" value="no domestication unlock · no ownership · no breeding program · no livestock inventory · no pastoral economy" />
    </>
  );
}

// ADAPTIVE EFFICACY FEEDBACK-1 proof block: the persisted response-specific
// efficacy records the sim itself wrote when it classified an attempt — which
// response, in which matching ford/camp context, whether the practiced relief
// was active, the real coefficient touched (pre-value / effect / cap), how the
// outcome was classified, what it did to remembered danger / practice evidence
// / routine confidence, and the exact no-credit or mismatch reason.
function AdaptiveEfficacyDetails({ band }: { readonly band: Band }) {
  const records = band.adaptiveHuman?.efficacyRecords ?? [];
  if (records.length === 0) {
    return (
      <Detail
        label="adaptive efficacy"
        value="no response-specific efficacy evaluation recorded yet — crossing / camp-care attempts write records here; other families still use the generic movement fallback"
      />
    );
  }
  return (
    <>
      {records.map((record) => (
        <Detail
          key={record.id}
          label={`efficacy ${record.family} @t${String(record.tick)}`}
          value={`${record.classification} → ${record.outcome} · response ${record.responseId} · practiced response ${record.responseActive ? "ACTIVE" : "not active"} · context ${record.contextKey ?? "none"} · coefficient ${record.coefficient} pre ${formatCompactNumber(record.preEffectValue)} effect ${formatCompactNumber(record.effectAmount)} (cap ${formatCompactNumber(record.effectCap)}) · danger Δ${formatCompactNumber(record.dangerDelta)} · practice Δ${formatCompactNumber(record.practiceDelta)} · routine confidence Δ${formatCompactNumber(record.confidenceDelta)} · failure evidence Δ${record.failureDelta} · future influence ${record.futureInfluenceChanged ? "CHANGED" : "unchanged"} · ${record.localityNote} · ${record.reason}`}
        />
      ))}
    </>
  );
}

function DeepHistoryDetails({ band }: { readonly band: Band }) {
  const history = band.deepHistory;

  if (history === undefined) {
    return <Detail label="deep history" value="no deep history (pre-substrate band)" />;
  }

  const founding = history.founding;
  const openEra = history.openEra;
  const durableRange = formatYearRange(getDeepHistoryYearRange(history));
  const recentRange = formatYearRange(getRecentEventYearRange(band));
  const oldestPreserved = getOldestPreservedHistoryYear(history);
  const evidenceSummary = summarizeDeepHistoryEvidence(history);
  const latestEras = history.eras.slice(-3).map((era) =>
    `${era.id} Y${era.startYear}-${era.endYear} ${era.headline} pop ${era.populationStart}->${era.populationEnd}${era.merged ? " merged" : ""}`,
  );
  const latestEpisodes = history.episodes.slice(-4).map((episode) =>
    `${episode.id} Y${episode.startYear}-${episode.endYear ?? "open"} ${episode.type} sev ${formatCompactNumber(episode.severity)}`,
  );

  return (
    <>
      <Detail
        label="founding snapshot"
        value={`present · ${founding.kind} · year ${founding.foundedAt.year} · tile ${String(founding.foundingTileId)}`}
      />
      <Detail
        label="founding context"
        value={`water ${formatOptionalNumber(founding.foundingTileWaterAccess)} · riverbank ${formatOptionalBoolean(founding.foundingTileIsRiverbank)} · coastal ${formatOptionalBoolean(founding.foundingTileIsCoastal)} · floodplain ${formatOptionalBoolean(founding.foundingTileIsFloodplain)}`}
      />
      <Detail
        label="origin / parent"
        value={founding.parentBandId === undefined
          ? `origin · cause ${founding.creationCause ?? "unknown"}`
          : `daughter/fission · parent ${String(founding.parentBandId)} · relation ${founding.relation ?? "unknown"}`}
      />
      <Detail
        label="founding honesty"
        value={founding.unknownAtFounding.length === 0 ? "no unknown founding fields recorded" : founding.unknownAtFounding.slice(0, 6).join(" · ")}
      />
      <Detail
        label="era records"
        value={`closed ${history.eras.length}/${history.caps.maxEraRecords} · open ${openEra === undefined ? "none" : `Y${openEra.startYear}-${history.lastAdvancedYear} (${openEra.yearsAccumulated}y)`}`}
      />
      <Detail
        label="durable episodes"
        value={`lived ${history.episodes.length}/${history.caps.maxEpisodes} · inherited ${history.inheritedEpisodes.length}/${history.caps.maxInheritedEpisodes}`}
      />
      <Detail
        label="history ranges"
        value={`oldest ${oldestPreserved ?? "unknown"} · durable ${durableRange} · recent event memory ${recentRange}`}
      />
      <Detail
        label="inheritance"
        value={`era summaries ${history.inheritedEraSummaries.length}/${history.caps.maxInheritedEraSummaries} · ancestry depth ${history.ancestryLine.length}/${history.caps.maxAncestryEntries}`}
      />
      <Detail
        label="terminal record"
        value={history.terminalRecord === undefined
          ? "none"
          : `${history.terminalRecord.cause} · year ${history.terminalRecord.year} · pop ${history.terminalRecord.populationAtEnd}${history.terminalRecord.absorbedByBandId === undefined ? "" : ` · by ${String(history.terminalRecord.absorbedByBandId)}`}`}
      />
      <Detail
        label="payload / caps"
        value={`${formatBytes(history.payloadBytesEstimate)} of 20.0 KB soft cap · capsHeld=${String(history.caps.capsHeld)} · erasMerged ${history.caps.erasMergedCount} · episodesDropped ${history.caps.episodesDroppedCount}`}
      />
      <Detail
        label="evidence kinds"
        value={evidenceSummary.length === 0 ? "none" : evidenceSummary}
      />
      <Detail
        label="integrity flags"
        value={`observeOnly=${String(history.integrity.observeOnly)} · noBehaviorInfluence=${String(history.integrity.noBehaviorInfluence)} · evidenceBacked=${String(history.integrity.evidenceBacked)} · noInventedClaims=${String(history.integrity.noInventedClaims)}`}
      />
      <Detail
        label="latest eras"
        value={latestEras.length === 0 ? "none yet" : latestEras.join(" | ")}
      />
      <Detail
        label="latest episodes"
        value={latestEpisodes.length === 0 ? "none yet" : latestEpisodes.join(" | ")}
      />
    </>
  );
}

function EventSystemDetails({ band, world }: { readonly band: Band; readonly world: WorldState | null }) {
  if (world === null) {
    return <Detail label="canonical events" value="world unavailable" />;
  }

  const state = deriveCanonicalEvents(world, band);
  const familyCounts = Object.entries(state.familyCounts)
    .filter(([, count]) => count > 0)
    .map(([family, count]) => `${familyLabel(family as Parameters<typeof familyLabel>[0])} ${count}`)
    .join(" · ");
  const sourceCounts = Object.entries(state.sourceCounts)
    .filter(([, count]) => count > 0)
    .map(([source, count]) => `${source.replace(/_/g, " ")} ${count}`)
    .join(" · ");
  const oldest = state.oldestEventYear === undefined ? "unknown" : `Y${state.oldestEventYear}`;
  const recentRange = formatYearRange(state.recentRange);
  const durableRange = formatYearRange(state.durableRange);

  return (
    <>
      <Detail label="canonical events" value={`${state.events.length}/${state.caps.totalEventCap} selected-band projection`} />
      <Detail
        label="recent / durable / inherited"
        value={`${state.recentEventCount} / ${state.durableEventCount} / ${state.inheritedEventCount}`}
      />
      <Detail label="grouped events" value={String(state.groupedEventCount)} />
      <Detail label="family counts" value={familyCounts.length === 0 ? "none" : familyCounts} />
      <Detail label="source counts" value={sourceCounts.length === 0 ? "none" : sourceCounts} />
      <Detail label="event ranges" value={`oldest ${oldest} · recent ${recentRange} · durable ${durableRange}`} />
      <Detail
        label="caps"
        value={`perFamily ${state.caps.perFamilyCap} · evidenceChips ${state.caps.evidenceChipCap} · relatedLinks ${state.caps.relatedLinkCap} · droppedFamily ${state.caps.droppedByFamilyCap} · droppedTotal ${state.caps.droppedByTotalCap} · capsHeld=${String(state.caps.capsHeld)}`}
      />
      <Detail
        label="hook counts"
        value={`referent hooks ${state.events.reduce((sum, event) => sum + event.referentHookCount, 0)} · talk hooks ${state.events.reduce((sum, event) => sum + event.talkMentionCount, 0)} · chronicle targets ${state.events.filter((event) => event.chronicleLinkIds.length > 0).length}`}
      />
      <Detail
        label="integrity flags"
        value={`selectedBandOnly=${String(state.linkIntegrity.selectedBandOnly)} · provenance=${String(state.linkIntegrity.allEventsHaveProvenance)} · evidence=${String(state.linkIntegrity.allEventsHaveEvidence)} · talkHookOnly=${String(state.linkIntegrity.talkIsHookOnly)} · noBehaviorInfluence=${String(state.linkIntegrity.noBehaviorInfluence)}`}
      />
      <Detail label="payload estimate" value={`${formatBytes(state.technicalProof.payloadBytesEstimate)} selected-band projection`} />
      <Detail label="max event payload" value={formatBytes(state.technicalProof.maxEventPayloadBytes)} />
      <Detail label="event id samples" value={state.technicalProof.eventIdSamples.join(" | ") || "none"} />
      <Detail label="source id samples" value={state.technicalProof.sourceIdSamples.join(" | ") || "none"} />
    </>
  );
}

function BandIdentityDetails({ band, world }: { readonly band: Band; readonly world: WorldState | null }) {
  if (world === null) {
    return <Detail label="band identity" value="world unavailable" />;
  }

  const profile = deriveBandIdentityProfile(world, band);
  const evidenceKinds = Object.entries(profile.technicalProof.evidenceKindCounts)
    .filter(([, count]) => count > 0)
    .map(([kind, count]) => `${kind.replace(/_/g, " ")} ${count}`)
    .join(" · ");
  const cardSummary = profile.cards.map((card) =>
    `${card.dimension.replace(/_/g, " ")}=${card.strength}/${formatCompactNumber(card.confidence)} e${card.evidence.length}`,
  ).join(" | ");

  return (
    <>
      <Detail label="identity projection" value={`${profile.cards.length}/${profile.caps.cardCap} cards · ${profile.dimensionsPresent.length} dimensions`} />
      <Detail label="summary" value={`${profile.summaryTitle} · ${profile.summaryLines.join(" ")}`} />
      <Detail
        label="evidence counts"
        value={`lived ${profile.livedEvidenceCount} · inherited ${profile.inheritedEvidenceCount} · event refs ${profile.eventRefCount} · deep refs ${profile.deepHistoryRefCount} · activity refs ${profile.activityRefCount}`}
      />
      <Detail
        label="signal counts"
        value={`strong ${profile.strongSignalCount} · weak/uncertain ${profile.weakSignalCount}`}
      />
      <Detail label="card summary" value={cardSummary.length === 0 ? "none" : cardSummary} />
      <Detail label="evidence kinds" value={evidenceKinds.length === 0 ? "none" : evidenceKinds} />
      <Detail
        label="caps"
        value={`evidence/card ${profile.caps.evidencePerCardCap} · links/card ${profile.caps.linkPerCardCap} · summary lines ${profile.caps.summaryLineCap} · capsHeld=${String(profile.caps.capsHeld)}`}
      />
      <Detail
        label="integrity flags"
        value={`selectedBandOnly=${String(profile.integrity.selectedBandOnly)} · projectionOnly=${String(profile.integrity.projectionOnly)} · noBehaviorInfluence=${String(profile.integrity.noBehaviorInfluence)} · evidenceBacked=${String(profile.integrity.evidenceBacked)} · ignoresStartingSkills=${String(profile.integrity.ignoresLegacyStartingSkills)} · inheritedSeparated=${String(profile.integrity.inheritedSeparated)}`}
      />
      <Detail label="payload estimate" value={`${formatBytes(profile.technicalProof.payloadBytesEstimate)} selected-band projection`} />
      <Detail label="max card payload" value={formatBytes(profile.technicalProof.maxCardPayloadBytes)} />
      <Detail label="event id samples" value={profile.technicalProof.relatedEventIdSamples.join(" | ") || "none"} />
      <Detail label="source id samples" value={profile.technicalProof.sourceIdSamples.join(" | ") || "none"} />
    </>
  );
}

function KnowledgeEcologyDetails({ band, world }: { readonly band: Band; readonly world: WorldState | null }) {
  if (world === null) {
    return <Detail label="knowledge ecology" value="world unavailable" />;
  }

  const profile = deriveKnowledgeEcologyProfile(world, band);
  const domainCounts = Object.entries(profile.domainCounts)
    .filter(([, count]) => count > 0)
    .map(([domain, count]) => `${domain} ${count}`)
    .join(" · ");
  const carrierCounts = Object.entries(profile.carrierCounts)
    .filter(([, count]) => count > 0)
    .map(([carrier, count]) => `${carrier} ${count}`)
    .join(" · ");
  const evidenceKinds = Object.entries(profile.technicalProof.evidenceKindCounts)
    .filter(([, count]) => count > 0)
    .map(([kind, count]) => `${kind} ${count}`)
    .join(" · ");
  const itemSummary = profile.items
    .slice(0, 6)
    .map((item) => `${item.domain}:${item.confidenceBand}:${item.practicalStatus}`)
    .join(" | ");

  return (
    <>
      <Detail label="knowledge projection" value={`${profile.items.length}/${profile.caps.itemCap} items · ${profile.domainsPresent.length} domains`} />
      <Detail label="overview" value={`${profile.overviewTitle} · ${profile.overviewLines.join(" ")}`} />
      <Detail
        label="item counts"
        value={`lived ${profile.livedItemCount} · inherited ${profile.inheritedItemCount} · practical ${profile.practicalItemCount} · heard ${profile.heardItemCount} · story ${profile.storyOnlyItemCount} · fading ${profile.fadingItemCount}`}
      />
      <Detail label="domains" value={domainCounts || "none"} />
      <Detail label="carriers" value={carrierCounts || "none"} />
      <Detail
        label="evidence counts"
        value={`activity ${profile.activityEvidenceCount} · events ${profile.eventEvidenceCount} · deep history ${profile.deepHistoryEvidenceCount} · memory ${profile.memoryEvidenceCount}`}
      />
      <Detail label="evidence kinds" value={evidenceKinds || "none"} />
      <Detail
        label="caps"
        value={`items ${profile.caps.itemCap} · per-domain ${profile.caps.perDomainCap} · evidence/item ${profile.caps.evidencePerItemCap} · links/item ${profile.caps.linkPerItemCap} · held ${String(profile.caps.capsHeld)}`}
      />
      <Detail
        label="integrity"
        value={`selectedBandOnly=${profile.integrity.selectedBandOnly} · projectionOnly=${profile.integrity.projectionOnly} · noBehaviorInfluence=${profile.integrity.noBehaviorInfluence} · existingActivityPartiesOnly=${profile.integrity.usesExistingActivityPartiesOnly} · ignoresStartingSkills=${profile.integrity.ignoresLegacyStartingSkills} · inheritedSeparated=${profile.integrity.inheritedSeparated} · practicalVsStory=${profile.integrity.practicalVsStorySeparated}`}
      />
      <Detail
        label="payload estimate"
        value={`${formatBytes(profile.technicalProof.payloadBytesEstimate)} · max item ${formatBytes(profile.technicalProof.maxItemPayloadBytes)} · unresolved refs ${profile.technicalProof.unresolvedReferenceCount}`}
      />
      <Detail label="item sample" value={itemSummary || "none"} />
      <Detail label="source id samples" value={profile.technicalProof.sourceIdSamples.join(" | ") || "none"} />
      <Detail label="event id samples" value={profile.technicalProof.relatedEventIdSamples.join(" | ") || "none"} />
    </>
  );
}

function KnowledgeCarrierDetails({ band, world }: { readonly band: Band; readonly world: WorldState | null }) {
  if (world === null) {
    return <Detail label="knowledge carriers" value="world unavailable" />;
  }

  const profile = deriveKnowledgeCarrierProfile(world, band);
  const stateCounts = Object.entries(profile.stateCounts)
    .filter(([, count]) => count > 0)
    .map(([state, count]) => `${knowledgeAvailabilityLabel(state as Parameters<typeof knowledgeAvailabilityLabel>[0])} ${count}`)
    .join(" · ");
  const carrierCounts = Object.entries(profile.carrierCounts)
    .filter(([, count]) => count > 0)
    .map(([carrier, count]) => `${knowledgeCarrierClassLabel(carrier as Parameters<typeof knowledgeCarrierClassLabel>[0])} ${count}`)
    .join(" · ");
  const domainCounts = Object.entries(profile.domainCounts)
    .filter(([, count]) => count > 0)
    .map(([domain, count]) => `${knowledgeCarrierDomainLabel(domain as Parameters<typeof knowledgeCarrierDomainLabel>[0])} ${count}`)
    .join(" · ");
  const sourceCounts = Object.entries(profile.technicalProof.sourceSystemCounts)
    .filter(([, count]) => count > 0)
    .map(([source, count]) => `${source.replace(/_/g, " ")} ${count}`)
    .join(" · ");
  const itemSummary = profile.items
    .slice(0, 8)
    .map((item) =>
      `${item.domain}:${item.state}:str ${formatCompactNumber(item.strength)} avail ${formatCompactNumber(item.availability)} decay ${formatCompactNumber(item.decayPressure)} carriers ${item.carrierClasses.join("+")}`,
    )
    .join(" | ");

  return (
    <>
      <Detail label="carrier projection" value={`${profile.items.length}/${profile.caps.itemCap} items · ${profile.publicCards.length}/${profile.caps.publicCardCap} public cards · mode ${profile.projectionMode}`} />
      <Detail label="overview" value={`${profile.overviewTitle} · ${profile.overviewLines.join(" ")}`} />
      <Detail label="domains" value={domainCounts || "none"} />
      <Detail label="states" value={stateCounts || "none"} />
      <Detail label="carrier classes" value={carrierCounts || "none"} />
      <Detail
        label="active / weak / source basis"
        value={`active/fresh/tested ${profile.activeItemCount} · fading ${profile.fadingItemCount} · dormant ${profile.dormantItemCount} · distorted ${profile.distortedItemCount} · inherited ${profile.inheritedFragmentCount} · copied ${profile.copiedUntestedCount} · local untested ${profile.locallyUntestedCount} · lost ${profile.lostOrUnavailableCount} · local-only ${profile.localOnlyItemCount} · lived ${profile.livedItemCount} · inherited basis ${profile.inheritedItemCount} · copied basis ${profile.copiedItemCount}`}
      />
      <Detail
        label="behavior hooks"
        value={`projection-only hooks ${profile.behaviorHooksCount} · max influence ${profile.maxBehaviorInfluence} · cap ${profile.technicalProof.behaviorHookCap} · hotPathSafe=${String(profile.technicalProof.hotPathSafe)}`}
      />
      <Detail
        label="daughter hooks"
        value={`inheritedState=${String(profile.daughterBottleneckHooks.inheritedFragmentState)} · parentCarrier=${String(profile.daughterBottleneckHooks.parentSourceCarrier)} · localTestingNeeded ${profile.daughterBottleneckHooks.daughterLocalTestingNeededCount} · confidenceLoss=${String(profile.daughterBottleneckHooks.inheritanceConfidenceLossRepresented)} · fuzzy ${profile.daughterBottleneckHooks.exactTileVsRegionFuzzinessCount} · inheritedRoutesUntested ${profile.daughterBottleneckHooks.untestedInheritedRouteCount} · warningsNoExactRoute ${profile.daughterBottleneckHooks.inheritedWarningWithoutExactRouteCount} · routinesNoPractice ${profile.daughterBottleneckHooks.inheritedRoutineWithoutPracticeCount} · mismatch ${profile.daughterBottleneckHooks.localMismatchRiskCount} · noFissionChange=${String(profile.daughterBottleneckHooks.noFissionBehaviorChange)}`}
      />
      <Detail
        label="social diffusion hooks"
        value={`visibleTrace ${profile.interBandDiffusionHooks.visibleTraceCount} · socialTrace ${profile.interBandDiffusionHooks.socialTraceCount} · copiedUntested ${profile.interBandDiffusionHooks.copiedUntestedCount} · copiedFailed ${profile.interBandDiffusionHooks.copiedFailedCount} · copiedLocalOnly ${profile.interBandDiffusionHooks.copiedLocalOnlyCount} · cautionFilter ${profile.interBandDiffusionHooks.trustCautionFilterCount} · sourceUnknown ${profile.interBandDiffusionHooks.sourceUnknownCount} · heardNotTested ${profile.interBandDiffusionHooks.heardWarningNotPersonallyTestedCount} · actualDiffusion=${String(!profile.interBandDiffusionHooks.noActualDiffusionImplemented)}`}
      />
      <Detail
        label="caps"
        value={`items ${profile.caps.itemCap} · per-domain ${profile.caps.itemsPerDomainCap} · carriers/item ${profile.caps.carriersPerItemCap} · evidence/item ${profile.caps.evidencePerItemCap} · linked refs/item ${profile.caps.linkedSystemPerItemCap} · technical refs ${profile.caps.technicalRefCap} · held ${String(profile.caps.capsHeld)}`}
      />
      <Detail
        label="integrity"
        value={`selectedBandOnly=${profile.integrity.selectedBandOnly} · projectionOnly=${profile.integrity.projectionOnly} · noBehaviorInfluence=${profile.integrity.noBehaviorInfluence} · dormantDoesNotDelete=${profile.integrity.dormantDoesNotDelete} · inheritedSeparated=${profile.integrity.inheritedSeparatedFromLived} · copiedSeparated=${profile.integrity.copiedUntestedSeparatedFromPracticed} · localOnlyNotGlobal=${profile.integrity.localOnlyNotGlobalSkill} · distortionEvidence=${profile.integrity.distortionBoundedEvidenceBased} · noNamedPeople=${profile.integrity.noNamedPeople}`}
      />
      <Detail
        label="anti-fake"
        value={`noNewEcology=${profile.integrity.noNewEcology} · noCultureReligionLawPropertyTerritoryTradeAgricultureWar=${profile.integrity.noCultureReligionMythLawPropertyTerritoryTradeAgricultureWar} · noSkillUnlocks=${profile.integrity.noSkillUnlocks} · noDecisionInfluence=${profile.integrity.noDecisionInfluence}`}
      />
      <Detail label="source systems" value={sourceCounts || "none"} />
      <Detail label="payload estimate" value={`${formatBytes(profile.technicalProof.payloadBytesEstimate)} · max item ${formatBytes(profile.technicalProof.maxItemPayloadBytes)} · broken refs ${profile.technicalProof.brokenRefs}`} />
      <Detail label="state enums" value={profile.technicalProof.exactStateEnums.join(" | ")} />
      <Detail label="carrier enum" value={profile.technicalProof.exactCarrierClasses.join(" | ")} />
      <Detail label="item sample" value={itemSummary || "none"} />
      <Detail label="source id samples" value={profile.technicalProof.sourceIdSamples.join(" | ") || "none"} />
      <Detail label="technical refs" value={profile.technicalProof.technicalRefs.join(" | ") || "none"} />
    </>
  );
}

function MaterialAffordanceDetails({ band, world }: { readonly band: Band; readonly world: WorldState | null }) {
  if (world === null) {
    return <Detail label="material affordance" value="world unavailable" />;
  }

  const profile = deriveMaterialAffordanceProfile(world, band);
  const familyCounts = Object.entries(profile.familyCounts)
    .filter(([, count]) => count > 0)
    .map(([family, count]) => `${materialAffordanceFamilyLabel(family as Parameters<typeof materialAffordanceFamilyLabel>[0])} ${count}`)
    .join(" · ");
  const statusCounts = Object.entries(profile.statusCounts)
    .filter(([, count]) => count > 0)
    .map(([status, count]) => `${materialAffordanceStatusLabel(status as Parameters<typeof materialAffordanceStatusLabel>[0])} ${count}`)
    .join(" · ");
  const strengthCounts = Object.entries(profile.strengthCounts)
    .filter(([, count]) => count > 0)
    .map(([strength, count]) => `${strength} ${count}`)
    .join(" · ");
  const sourceCounts = Object.entries(profile.sourceSystemCounts)
    .filter(([, count]) => count > 0)
    .map(([source, count]) => `${source.replace(/_/g, " ")} ${count}`)
    .join(" · ");
  const hookCounts = Object.entries(profile.futureHookCounts)
    .slice(0, 8)
    .map(([hook, count]) => `${hook} ${count}`)
    .join(" · ");
  const itemSummary = profile.items
    .slice(0, 8)
    .map((item) => `${item.family}:${item.status}:${formatCompactNumber(item.confidence)} e${item.evidence.length} c${item.constraints.length}`)
    .join(" | ");

  return (
    <>
      <Detail label="affordance projection" value={`${profile.items.length}/${profile.caps.itemCap} items · ${profile.familiesRepresented.length} families`} />
      <Detail label="overview" value={`${profile.overviewTitle} · ${profile.overviewLines.join(" ")}`} />
      <Detail label="families" value={familyCounts || "none"} />
      <Detail label="statuses" value={statusCounts || "none"} />
      <Detail label="strengths" value={strengthCounts || "none"} />
      <Detail
        label="basis counts"
        value={`material ${profile.materialBasisCount} · knowledge ${profile.knowledgeBasisCount} · activity ${profile.activityEvidenceCount} · event ${profile.eventEvidenceCount} · memory ${profile.memoryEvidenceCount} · constraints ${profile.constraintCount}`}
      />
      <Detail
        label="lived / inherited"
        value={`lived ${profile.livedBasisCount} · inherited ${profile.inheritedBasisCount} · unsupported/deferred ${profile.unsupportedOrDeferredCount}`}
      />
      <Detail label="source systems" value={sourceCounts || "none"} />
      <Detail label="future hook counts" value={hookCounts || "none"} />
      <Detail
        label="caps"
        value={`items ${profile.caps.itemCap} · evidence/item ${profile.caps.evidencePerItemCap} · basis/item ${profile.caps.basisPerItemCap} · constraints/item ${profile.caps.constraintPerItemCap} · hooks/item ${profile.caps.futureHookPerItemCap} · known tiles ${profile.technicalProof.knownTileContextCount}/${profile.caps.knownTileContextCap} · resources ${profile.technicalProof.resourceMemoryContextCount}/${profile.caps.resourceMemoryContextCap} · held ${String(profile.caps.capsHeld)}`}
      />
      <Detail
        label="integrity"
        value={`selectedBandOnly=${profile.integrity.selectedBandOnly} · projectionOnly=${profile.integrity.projectionOnly} · noBehaviorInfluence=${profile.integrity.noBehaviorInfluence} · noDecisionInfluence=${profile.integrity.noDecisionInfluence} · noPracticeDiscovery=${profile.integrity.noPracticeDiscovery} · noProblemFraming=${profile.integrity.noProblemFraming} · noSkillOrAdaptation=${profile.integrity.noSkillOrAdaptationSystem} · ignoresStartingSkills=${profile.integrity.ignoresLegacyStartingSkills} · inheritedSeparated=${profile.integrity.inheritedSeparated}`}
      />
      <Detail
        label="deferred systems"
        value={`culture ${String(profile.integrity.noCultureSystem)} · agriculture/settlement/territory/war ${String(profile.integrity.noAgricultureSettlementTerritoryWar)} · legacy skill proof ${profile.technicalProof.legacyStartingSkillProofCount} · decision isolation ${String(profile.technicalProof.decisionPathIsolation)}`}
      />
      <Detail label="chronicle integration" value={`${profile.chronicleIntegration.mode} · broken links ${profile.chronicleIntegration.brokenRenderedLinks} · ${profile.chronicleIntegration.reason}`} />
      <Detail
        label="payload estimate"
        value={`${formatBytes(profile.technicalProof.payloadBytesEstimate)} selected-band projection · max item ${formatBytes(profile.technicalProof.maxItemPayloadBytes)}`}
      />
      <Detail label="item sample" value={itemSummary || "none"} />
      <Detail label="source id samples" value={profile.technicalProof.sourceIdSamples.join(" | ") || "none"} />
      <Detail label="event id samples" value={profile.technicalProof.eventIdSamples.join(" | ") || "none"} />
      <Detail label="activity samples" value={profile.technicalProof.activityTripSamples.join(" | ") || "none"} />
    </>
  );
}

function ProblemPracticeDetails({ band, world }: { readonly band: Band; readonly world: WorldState | null }) {
  if (world === null) {
    return <Detail label="problem / practice" value="world unavailable" />;
  }

  const profile = deriveProblemPracticeProfile(world, band);
  const frameFamilies = Object.entries(profile.problemFamilyCounts)
    .filter(([, count]) => count > 0)
    .map(([family, count]) => `${problemFrameFamilyLabel(family as Parameters<typeof problemFrameFamilyLabel>[0])} ${count}`)
    .join(" · ");
  const candidateFamilies = Object.entries(profile.candidateFamilyCounts)
    .filter(([, count]) => count > 0)
    .map(([family, count]) => `${candidateFamilyLabel(family as Parameters<typeof candidateFamilyLabel>[0])} ${count}`)
    .join(" · ");
  const statuses = Object.entries(profile.statusCounts)
    .filter(([, count]) => count > 0)
    .map(([status, count]) => `${practiceExperimentStatusLabel(status as Parameters<typeof practiceExperimentStatusLabel>[0])} ${count}`)
    .join(" · ");
  const feedback = Object.entries(profile.feedbackTypeCounts)
    .filter(([, count]) => count > 0)
    .map(([type, count]) => `${practiceFeedbackTypeLabel(type as Parameters<typeof practiceFeedbackTypeLabel>[0])} ${count}`)
    .join(" · ");
  const sources = Object.entries(profile.sourceSystemCounts)
    .filter(([, count]) => count > 0)
    .map(([source, count]) => `${source.replace(/_/g, " ")} ${count}`)
    .join(" · ");
  const perceivedCauses = Object.entries(profile.perceivedCauseCounts)
    .slice(0, 6)
    .map(([cause, count]) => `${cause} ${count}`)
    .join(" · ");
  const frameSummary = profile.problemFrames
    .slice(0, 7)
    .map((frame) => `${frame.family}:${formatCompactNumber(frame.confidence)} e${frame.evidence.length}`)
    .join(" | ");
  const candidateSummary = profile.practiceCandidates
    .slice(0, 7)
    .map((candidate) => `${candidate.family}:${candidate.status}:${candidate.expectedFeedbackType}:${formatCompactNumber(candidate.confidence)}`)
    .join(" | ");

  return (
    <>
      <Detail label="projection" value={`${profile.problemFrames.length}/${profile.caps.problemFrameCap} frames · ${profile.practiceCandidates.length}/${profile.caps.practiceCandidateCap} candidates`} />
      <Detail label="overview" value={`${profile.overviewTitle} · ${profile.overviewLines.join(" ")}`} />
      <Detail label="frame families" value={frameFamilies || "none"} />
      <Detail label="candidate families" value={candidateFamilies || "none"} />
      <Detail label="candidate statuses" value={statuses || "none"} />
      <Detail label="feedback types" value={feedback || "none"} />
      <Detail label="perceived causes" value={perceivedCauses || "none"} />
      <Detail
        label="source refs"
        value={`affordance ${profile.affordanceRefCount} · knowledge ${profile.knowledgeRefCount} · event ${profile.eventRefCount} · activity ${profile.activityRefCount} · repetition ${profile.repetitionRefCount}`}
      />
      <Detail label="source systems" value={sources || "none"} />
      <Detail
        label="risks"
        value={`uncertainty/misread ${profile.uncertaintyMisreadCount} · dead-end ${profile.deadEndRiskCount} · false-confidence ${profile.falseConfidenceRiskCount} · low-feedback ${profile.lowFeedbackRiskCount} · local-only ${profile.localOnlyRiskCount}`}
      />
      <Detail label="lived / inherited" value={`lived ${profile.livedBasisCount} · inherited ${profile.inheritedBasisCount}`} />
      <Detail label="constraints" value={profile.constraints.join(" | ") || "none"} />
      <Detail
        label="caps"
        value={`frames ${profile.caps.problemFrameCap} · candidates ${profile.caps.practiceCandidateCap} · evidence/frame ${profile.caps.evidencePerFrameCap} · evidence/candidate ${profile.caps.evidencePerCandidateCap} · basis/candidate ${profile.caps.basisPerCandidateCap} · links ${profile.caps.relatedLinkCap} · context ${profile.caps.contextRecordCap} · held ${String(profile.caps.capsHeld)}`}
      />
      <Detail
        label="integrity"
        value={`selectedBandOnly=${profile.integrity.selectedBandOnly} · projectionOnly=${profile.integrity.projectionOnly} · noBehaviorInfluence=${profile.integrity.noBehaviorInfluence} · noDecisionInfluence=${profile.integrity.noDecisionInfluence} · noSkillOrAdaptationState=${profile.integrity.noSkillOrAdaptationState} · noAutomaticImprovement=${profile.integrity.noAutomaticImprovement} · ignoresStartingSkills=${profile.integrity.ignoresLegacyStartingSkills}`}
      />
      <Detail
        label="bounded interpretation"
        value={`inheritedSeparated=${profile.integrity.inheritedSeparated} · daughterLocalTesting=${profile.integrity.daughterParentKnowledgeNotTreatedAsTestedHere} · repetitionIsNotMastery=${profile.integrity.repetitionIsNotMastery} · candidatesRequireProblemBasis=${profile.integrity.candidatesRequireProblemBasis}`}
      />
      <Detail
        label="deferred systems"
        value={`culture/taboo/myth/worldview/language=${profile.integrity.noCultureTabooMythWorldviewLanguage} · agriculture/settlement/territory/war=${profile.integrity.noAgricultureSettlementTerritoryWar} · fakeSkillState ${profile.technicalProof.fakeSkillStateCount} · legacySkillProof ${profile.technicalProof.legacyStartingSkillProofCount} · decision isolation ${String(profile.technicalProof.decisionPathIsolation)}`}
      />
      <Detail label="chronicle integration" value={`${profile.chronicleIntegration.mode} · broken links ${profile.chronicleIntegration.brokenRenderedLinks} · ${profile.chronicleIntegration.reason}`} />
      <Detail
        label="payload estimate"
        value={`${formatBytes(profile.technicalProof.payloadBytesEstimate)} selected-band projection · max frame ${formatBytes(profile.technicalProof.maxFramePayloadBytes)} · max candidate ${formatBytes(profile.technicalProof.maxCandidatePayloadBytes)}`}
      />
      <Detail label="frame sample" value={frameSummary || "none"} />
      <Detail label="candidate sample" value={candidateSummary || "none"} />
      <Detail label="affordance samples" value={profile.technicalProof.affordanceIdSamples.join(" | ") || "none"} />
      <Detail label="knowledge samples" value={profile.technicalProof.knowledgeIdSamples.join(" | ") || "none"} />
      <Detail label="event samples" value={profile.technicalProof.eventIdSamples.join(" | ") || "none"} />
      <Detail label="activity samples" value={profile.technicalProof.activityIdSamples.join(" | ") || "none"} />
      <Detail label="repetition samples" value={profile.technicalProof.repetitionIdSamples.join(" | ") || "none"} />
    </>
  );
}

function CampFootholdDetails({ band, world }: { readonly band: Band; readonly world: WorldState | null }) {
  if (world === null) {
    return <Detail label="camp foothold" value="world unavailable" />;
  }

  const profile = deriveCampFootholdProfile(world, band);
  const familyCounts = Object.entries(profile.factorFamilyCounts)
    .filter(([, count]) => count > 0)
    .map(([family, count]) => `${campFootholdFactorFamilyLabel(family as Parameters<typeof campFootholdFactorFamilyLabel>[0])} ${count}`)
    .join(" · ");
  const statuses = Object.entries(profile.statusCounts)
    .filter(([, count]) => count > 0)
    .map(([status, count]) => `${campFootholdStatusLabel(status as Parameters<typeof campFootholdStatusLabel>[0])} ${count}`)
    .join(" · ");
  const sources = Object.entries(profile.sourceSystemCounts)
    .filter(([, count]) => count > 0)
    .map(([source, count]) => `${source.replace(/_/g, " ")} ${count}`)
    .join(" · ");
  const placeSummary = profile.places
    .slice(0, 6)
    .map((place) => `${place.role}:${place.status}:${formatCompactNumber(place.confidence)} e${place.evidence.length}`)
    .join(" | ");
  const factorSummary = profile.factors
    .slice(0, 6)
    .map((factor) => `${factor.family}:${factor.status}:${formatCompactNumber(factor.confidence)} e${factor.evidence.length}`)
    .join(" | ");

  return (
    <>
      <Detail label="projection" value={`${profile.places.length}/${profile.caps.placeCap} places · ${profile.factors.length}/${profile.caps.factorCap} factors · storage ${profile.temporaryCacheSignals.length}/${profile.caps.storageSignalCap} · fire ${profile.fireHearthFuelSignals.length}/${profile.caps.fireSignalCap} · care ${profile.careCampSignals.length}/${profile.caps.careSignalCap}`} />
      <Detail label="overview" value={`${profile.overviewTitle} · ${profile.overviewLines.join(" ")}`} />
      <Detail label="factor families" value={familyCounts || "none"} />
      <Detail label="statuses" value={statuses || "none"} />
      <Detail
        label="source refs"
        value={`places ${profile.placeRefCount} · activity ${profile.activityRefCount} · affordance ${profile.materialAffordanceRefCount} · problem/practice ${profile.problemPracticeRefCount} · knowledge ${profile.knowledgeRefCount} · event ${profile.eventRefCount} · body camp ${profile.bodyCampRefCount} · proto camp ${profile.protoCampRefCount}`}
      />
      <Detail label="source systems" value={sources || "none"} />
      <Detail label="lived / inherited" value={`lived ${profile.livedBasisCount} · inherited ${profile.inheritedBasisCount}`} />
      <Detail
        label="storage / fire / care"
        value={`temporary storage ${profile.temporaryStorageCount} · weak storage ${profile.weakStorageCount} · fire context ${profile.fireContextCount} · care burden ${profile.careBurdenCount}`}
      />
      <Detail label="constraints" value={profile.constraints.join(" | ")} />
      <Detail
        label="caps"
        value={`places ${profile.caps.placeCap} · factors ${profile.caps.factorCap} · evidence/item ${profile.caps.evidencePerItemCap} · basis/signal ${profile.caps.basisPerSignalCap} · context ${profile.caps.contextRecordCap} · held ${String(profile.caps.capsHeld)}`}
      />
      <Detail
        label="integrity"
        value={`selectedBandOnly=${profile.integrity.selectedBandOnly} · projectionOnly=${profile.integrity.projectionOnly} · noNewBehaviorInfluence=${profile.integrity.noNewBehaviorInfluence} · noDecisionInfluence=${profile.integrity.noDecisionInfluence} · usesExistingCampStateOnly=${profile.integrity.usesExistingCampStateOnly}`}
      />
      <Detail
        label="deferred systems"
        value={`settlement=${profile.integrity.noSettlementSystem} · agriculture/domestication=${profile.integrity.noAgricultureDomestication} · inventory/surplus/property=${profile.integrity.noInventorySurplusProperty} · culture/taboo/myth/worldview/language=${profile.integrity.noCultureTabooMythWorldviewLanguage} · skill/tech unlock=${profile.integrity.noSkillOrTechUnlock}`}
      />
      <Detail
        label="bounded interpretation"
        value={`temporaryStorage=${profile.integrity.storageIsTemporaryWeak} · fireContextOnly=${profile.integrity.fireIsCampContextOnly} · careAggregateOnly=${profile.integrity.careIsAggregateOnly} · inheritedSeparated=${profile.integrity.inheritedSeparated} · daughterLocalTesting=${profile.integrity.daughterParentMemoryNotLocalTesting}`}
      />
      <Detail label="chronicle integration" value={`${profile.chronicleIntegration.mode} · broken links ${profile.chronicleIntegration.brokenRenderedLinks} · ${profile.chronicleIntegration.reason}`} />
      <Detail
        label="payload estimate"
        value={`${formatBytes(profile.technicalProof.payloadBytesEstimate)} selected-band projection · max place ${formatBytes(profile.technicalProof.maxPlacePayloadBytes)} · max factor ${formatBytes(profile.technicalProof.maxFactorPayloadBytes)} · max signal ${formatBytes(profile.technicalProof.maxSignalPayloadBytes)}`}
      />
      <Detail
        label="claim guards"
        value={`legacy skill proof ${profile.technicalProof.legacyStartingSkillProofCount} · fake settlement ${profile.technicalProof.fakeSettlementClaimCount} · fake inventory ${profile.technicalProof.fakeInventoryClaimCount} · fake skill ${profile.technicalProof.fakeSkillClaimCount} · fake culture ${profile.technicalProof.fakeCultureClaimCount} · decision isolation ${String(profile.technicalProof.decisionPathIsolation)}`}
      />
      <Detail label="place sample" value={placeSummary || "none"} />
      <Detail label="factor sample" value={factorSummary || "none"} />
      <Detail label="source id samples" value={profile.technicalProof.sourceIdSamples.join(" | ") || "none"} />
      <Detail label="place samples" value={profile.technicalProof.placeIdSamples.join(" | ") || "none"} />
      <Detail label="activity samples" value={profile.technicalProof.activityIdSamples.join(" | ") || "none"} />
      <Detail label="affordance samples" value={profile.technicalProof.affordanceIdSamples.join(" | ") || "none"} />
      <Detail label="problem/practice samples" value={profile.technicalProof.problemPracticeIdSamples.join(" | ") || "none"} />
      <Detail label="knowledge samples" value={profile.technicalProof.knowledgeIdSamples.join(" | ") || "none"} />
      <Detail label="event samples" value={profile.technicalProof.eventIdSamples.join(" | ") || "none"} />
    </>
  );
}

function PracticeFeedbackReadinessDetails({ band, world }: { readonly band: Band; readonly world: WorldState | null }) {
  if (world === null) {
    return <Detail label="practice feedback" value="world unavailable" />;
  }

  const profile = derivePracticeFeedbackReadinessProfile(world, band);
  const families = Object.entries(profile.familyCounts)
    .filter(([, count]) => count > 0)
    .map(([family, count]) => `${practiceFeedbackReadinessFamilyLabel(family as Parameters<typeof practiceFeedbackReadinessFamilyLabel>[0])} ${count}`)
    .join(" · ");
  const feedbackTypes = Object.entries(profile.feedbackTypeCounts)
    .filter(([, count]) => count > 0)
    .map(([feedback, count]) => `${practiceFeedbackReadinessFeedbackTypeLabel(feedback as Parameters<typeof practiceFeedbackReadinessFeedbackTypeLabel>[0])} ${count}`)
    .join(" · ");
  const feedbackQualities = Object.entries(profile.feedbackQualityCounts)
    .filter(([, count]) => count > 0)
    .map(([quality, count]) => `${practiceFeedbackQualityLabel(quality as Parameters<typeof practiceFeedbackQualityLabel>[0])} ${count}`)
    .join(" · ");
  const statuses = Object.entries(profile.readinessStatusCounts)
    .filter(([, count]) => count > 0)
    .map(([status, count]) => `${practiceFeedbackReadinessStatusLabel(status as Parameters<typeof practiceFeedbackReadinessStatusLabel>[0])} ${count}`)
    .join(" · ");
  const blockers = Object.entries(profile.blockerCounts)
    .filter(([, count]) => count > 0)
    .map(([blocker, count]) => `${blocker.replace(/_/g, " ")} ${count}`)
    .join(" · ");
  const sources = Object.entries(profile.sourceSystemCounts)
    .filter(([, count]) => count > 0)
    .map(([source, count]) => `${source.replace(/_/g, " ")} ${count}`)
    .join(" · ");
  const itemSummary = profile.items
    .slice(0, 8)
    .map((item) => `${item.family}:${item.readinessStatus}:${item.feedbackType}:${formatCompactNumber(item.confidence)} e${item.evidence.length}`)
    .join(" | ");

  return (
    <>
      <Detail label="projection" value={`${profile.items.length}/${profile.caps.itemCap} readiness items · repeated ${profile.repeatedExposureCount} · max per family ${profile.caps.itemsPerFamilyCap}`} />
      <Detail label="overview" value={`${profile.overviewTitle} · ${profile.overviewLines.join(" ")}`} />
      <Detail label="families" value={families || "none"} />
      <Detail label="feedback types" value={feedbackTypes || "none"} />
      <Detail label="feedback quality" value={feedbackQualities || "none"} />
      <Detail label="readiness status" value={statuses || "none"} />
      <Detail
        label="risk counts"
        value={`dead-end ${profile.deadEndRiskCount} · false-confidence ${profile.falseConfidenceRiskCount} · local-only ${profile.localOnlyRiskCount} · low-feedback ${profile.lowFeedbackRiskCount}`}
      />
      <Detail label="blockers" value={blockers || "none"} />
      <Detail
        label="source refs"
        value={`problem ${profile.problemRefCount} · candidate ${profile.candidateRefCount} · affordance ${profile.affordanceRefCount} · knowledge ${profile.knowledgeRefCount} · activity ${profile.activityRefCount} · event ${profile.eventRefCount} · foothold ${profile.footholdRefCount} · repetition ${profile.repetitionRefCount}`}
      />
      <Detail label="source systems" value={sources || "none"} />
      <Detail label="lived / inherited" value={`lived ${profile.livedBasisCount} · inherited ${profile.inheritedBasisCount}`} />
      <Detail label="constraints" value={profile.constraints.join(" | ")} />
      <Detail
        label="caps"
        value={`items ${profile.caps.itemCap} · per family ${profile.caps.itemsPerFamilyCap} · evidence ${profile.caps.evidencePerItemCap} · blockers ${profile.caps.blockersPerItemCap} · risks ${profile.caps.risksPerItemCap} · basis ${profile.caps.basisPerItemCap} · links ${profile.caps.linkPerItemCap} · context ${profile.caps.contextRecordCap} · held ${String(profile.caps.capsHeld)}`}
      />
      <Detail
        label="integrity"
        value={`selectedBandOnly=${profile.integrity.selectedBandOnly} · projectionOnly=${profile.integrity.projectionOnly} · noBehaviorInfluence=${profile.integrity.noBehaviorInfluence} · noDecisionInfluence=${profile.integrity.noDecisionInfluence} · noSkillOrAdaptationState=${profile.integrity.noSkillOrAdaptationState} · noAutomaticImprovement=${profile.integrity.noAutomaticImprovement}`}
      />
      <Detail
        label="bounded interpretation"
        value={`learningReadyIsNotSkill=${profile.integrity.learningReadyLaterIsNotSkill} · inheritedSeparated=${profile.integrity.inheritedSeparated} · daughterLocalTesting=${profile.integrity.daughterParentRoutineNotLocalTesting} · badRepetitionRepresented=${profile.integrity.badRepetitionRepresented} · candidateOrRepeatedBasis=${profile.integrity.itemsRequireCandidateOrRepeatedAffordanceBasis}`}
      />
      <Detail
        label="deferred systems"
        value={`culture/taboo/myth/worldview/language=${profile.integrity.noCultureTabooMythWorldviewLanguage} · settlement/inventory/property/storage=${profile.integrity.noSettlementInventoryPropertyStorageEconomy} · agriculture/domestication/war=${profile.integrity.noAgricultureDomesticationWar} · ignoresStartingSkills=${profile.integrity.ignoresLegacyStartingSkills}`}
      />
      <Detail label="chronicle integration" value={`${profile.chronicleIntegration.mode} · broken links ${profile.chronicleIntegration.brokenRenderedLinks} · ${profile.chronicleIntegration.reason}`} />
      <Detail
        label="payload estimate"
        value={`${formatBytes(profile.technicalProof.payloadBytesEstimate)} selected-band projection · max item ${formatBytes(profile.technicalProof.maxItemPayloadBytes)}`}
      />
      <Detail
        label="claim guards"
        value={`legacy skill proof ${profile.technicalProof.legacyStartingSkillProofCount} · fake skill ${profile.technicalProof.fakeSkillClaimCount} · fake culture ${profile.technicalProof.fakeCultureClaimCount} · fake settlement/inventory ${profile.technicalProof.fakeSettlementInventoryClaimCount} · decision isolation ${String(profile.technicalProof.decisionPathIsolation)}`}
      />
      <Detail label="item sample" value={itemSummary || "none"} />
      <Detail label="source samples" value={profile.technicalProof.sourceIdSamples.join(" | ") || "none"} />
      <Detail label="problem samples" value={profile.technicalProof.problemFrameIdSamples.join(" | ") || "none"} />
      <Detail label="candidate samples" value={profile.technicalProof.practiceCandidateIdSamples.join(" | ") || "none"} />
      <Detail label="affordance samples" value={profile.technicalProof.affordanceIdSamples.join(" | ") || "none"} />
      <Detail label="knowledge samples" value={profile.technicalProof.knowledgeIdSamples.join(" | ") || "none"} />
      <Detail label="activity samples" value={profile.technicalProof.activityIdSamples.join(" | ") || "none"} />
      <Detail label="event samples" value={profile.technicalProof.eventIdSamples.join(" | ") || "none"} />
      <Detail label="foothold samples" value={profile.technicalProof.footholdIdSamples.join(" | ") || "none"} />
      <Detail label="repetition samples" value={profile.technicalProof.repetitionIdSamples.join(" | ") || "none"} />
    </>
  );
}

function AdaptiveHumanDetails({ band, world }: { readonly band: Band; readonly world: WorldState | null }) {
  if (world === null) {
    return <Detail label="adaptive human" value="world unavailable" />;
  }

  const profile = deriveAdaptiveHumanProfile(world, band);
  const ideaFamilies = Object.entries(profile.ideaFamilyCounts)
    .filter(([, count]) => count > 0)
    .map(([family, count]) => `${adaptiveIdeaFamilyLabel(family as Parameters<typeof adaptiveIdeaFamilyLabel>[0])} ${count}`)
    .join(" · ");
  const responses = Object.entries(profile.responseTypeCounts)
    .filter(([, count]) => count > 0)
    .map(([response, count]) => `${adaptiveResponseTypeLabel(response as Parameters<typeof adaptiveResponseTypeLabel>[0])} ${count}`)
    .join(" · ");
  const outcomes = Object.entries(profile.attemptOutcomeCounts)
    .filter(([, count]) => count > 0)
    .map(([outcome, count]) => `${adaptiveAttemptOutcomeLabel(outcome as Parameters<typeof adaptiveAttemptOutcomeLabel>[0])} ${count}`)
    .join(" · ");
  const quality = Object.entries(profile.feedbackQualityCounts)
    .filter(([, count]) => count > 0)
    .map(([entry, count]) => `${entry.replace(/_/g, " ")} ${count}`)
    .join(" · ");
  const routineConfidence = Object.entries(profile.routineConfidenceCounts)
    .filter(([, count]) => count > 0)
    .map(([entry, count]) => `${entry.replace(/_/g, " ")} ${count}`)
    .join(" · ");
  const ideaSummary = profile.ideas
    .slice(0, 8)
    .map((idea) => `${idea.family}:${idea.status}:${idea.proposedResponse}:${formatCompactNumber(idea.feasibility)} e${idea.evidence.length}`)
    .join(" | ");
  const attemptSummary = profile.attempts
    .slice(0, 8)
    .map((attempt) => `${attempt.attemptType}:${attempt.outcome}:${attempt.feedbackQuality}:${attempt.participants}`)
    .join(" | ");

  return (
    <>
      <Detail label="mode" value={`${profile.mode} · behavior active ${String(profile.integrity.behaviorActive)} · no new actions ${String(profile.integrity.noNewActions)}`} />
      <Detail label="overview" value={`${profile.overviewTitle} · ${profile.overviewLines.join(" ")}`} />
      <Detail
        label="counts"
        value={`ideas ${profile.ideas.length}/${profile.caps.activeIdeaCap} · responses ${profile.selectedResponses.length}/${profile.caps.selectedResponseCap} · attempts ${profile.attempts.length}/${profile.caps.attemptCap} · routines ${profile.localRoutines.length}/${profile.caps.routineCap} · adaptations ${profile.contextBoundAdaptations.length}/${profile.caps.adaptationCap} · variants ${profile.variants.length}/${profile.caps.variantCap}`}
      />
      <Detail label="idea families" value={ideaFamilies || "none"} />
      <Detail label="responses" value={responses || "none"} />
      <Detail label="attempt outcomes" value={outcomes || "none"} />
      <Detail label="feedback quality" value={quality || "none"} />
      <Detail label="routine confidence" value={routineConfidence || "none"} />
      <Detail
        label="selected / rejected"
        value={`selected ${profile.selectedIdeaCount} · rejected ${profile.rejectedIdeaCount} · copied ${profile.copiedIdeaCount} · inherited ${profile.inheritedIdeaCount} · desperate ${profile.desperateIdeaCount}`}
      />
      <Detail
        label="risk hooks"
        value={`dead-end ${profile.deadEndCount} · false-confidence ${profile.falseConfidenceCount} · local-only ${profile.localOnlyCount} · subgroup attempts ${profile.subgroupExecutionCount}`}
      />
      <Detail
        label="source refs"
        value={`problem ${profile.problemRefCount} · affordance ${profile.affordanceRefCount} · knowledge ${profile.knowledgeRefCount} · activity ${profile.activityRefCount} · practice feedback ${profile.practiceFeedbackRefCount} · camp/foothold ${profile.campFootholdRefCount} · social diffusion ${profile.socialDiffusionRefCount} · event refs ${profile.eventRefCount}`}
      />
      <Detail
        label="passive collapse"
        value={profile.passiveCollapseAudit === undefined
          ? "none"
          : `${profile.passiveCollapseAudit.status} · pressure ${formatCompactNumber(profile.passiveCollapseAudit.collapsePressure)} · attempts ${profile.passiveCollapseAudit.recentAttemptCount} · blocked ${profile.passiveCollapseAudit.blockedReasons.join(" | ") || "none"}`}
      />
      <Detail
        label="behavior trace"
        value={band.adaptiveHuman?.latestDecisionTrace === undefined
          ? "none"
          : `${band.adaptiveHuman.latestDecisionTrace.actionType} · score delta ${formatCompactNumber(band.adaptiveHuman.latestDecisionTrace.scoreDelta)} · scope ${band.adaptiveHuman.latestDecisionTrace.behaviorEffectScope} · idea ${band.adaptiveHuman.latestDecisionTrace.selectedIdeaId ?? "none"}`}
      />
      <Detail
        label="integrity"
        value={`bounded=${profile.integrity.behaviorInfluenceTraced} · no new ecology=${profile.integrity.noNewEcology} · no global=${profile.integrity.noGlobalUnlock} · local routines=${profile.integrity.localRoutinesNotGlobalSkills} · no automatic improvement=${profile.integrity.noAutomaticImprovement}`}
      />
      <Detail
        label="deferred systems"
        value={`agriculture/domestication/settlement/territory/war/culture=${profile.integrity.noAgricultureDomesticationSettlementTerritoryWarCulture} · daughter partial=${profile.integrity.daughterInheritancePartial} · copied can fail=${profile.integrity.copiedIdeasCanFail}`}
      />
      <Detail
        label="payload / caps"
        value={`${formatBytes(profile.payloadBytesEstimate)} · max ideas ${profile.maxIdeasProfile} · max routines ${profile.maxRoutinesProfile} · max evidence/item ${profile.maxEvidenceItem} · held ${String(profile.caps.capsHeld)}`}
      />
      <Detail label="idea sample" value={ideaSummary || "none"} />
      <Detail label="attempt sample" value={attemptSummary || "none"} />
      <Detail label="idea ids" value={profile.technicalProof.ideaIdSamples.join(" | ") || "none"} />
      <Detail label="response ids" value={profile.technicalProof.responseIdSamples.join(" | ") || "none"} />
      <Detail label="attempt ids" value={profile.technicalProof.attemptIdSamples.join(" | ") || "none"} />
      <Detail label="routine ids" value={profile.technicalProof.routineIdSamples.join(" | ") || "none"} />
      <Detail label="adaptation ids" value={profile.technicalProof.adaptationIdSamples.join(" | ") || "none"} />
      <Detail label="variant ids" value={profile.technicalProof.variantIdSamples.join(" | ") || "none"} />
      <Detail label="problem ids" value={profile.technicalProof.problemIdSamples.join(" | ") || "none"} />
      <Detail label="affordance ids" value={profile.technicalProof.affordanceIdSamples.join(" | ") || "none"} />
      <Detail label="practice-feedback ids" value={profile.technicalProof.practiceFeedbackIdSamples.join(" | ") || "none"} />
      <Detail label="camp/foothold ids" value={profile.technicalProof.campFootholdIdSamples.join(" | ") || "none"} />
      <Detail label="social diffusion ids" value={profile.technicalProof.socialDiffusionIdSamples.join(" | ") || "none"} />
      <Detail label="event refs" value={profile.technicalProof.eventRefSamples.join(" | ") || "none"} />
    </>
  );
}

function CampMovementDetails({ band, world }: { readonly band: Band; readonly world: WorldState | null }) {
  if (world === null) {
    return <Detail label="camp movement" value="world unavailable" />;
  }

  const profile = deriveCampMovementProfile(world, band);
  const establishment = profile.currentEstablishment;
  const latestTrace = profile.latestDecisionTrace;
  const oldCamp = profile.oldCampDecay
    .slice(0, 5)
    .map((record) => `${String(record.tileId)} ${formatCompactNumber(record.pullBefore)}>${formatCompactNumber(record.pullAfter)} ${record.reason}`)
    .join(" | ");
  const escapes = profile.stagnationEscapes
    .slice(0, 6)
    .map((escape) => `${escape.response}:${escape.status}:${escape.actionType}:${escape.blockedReasons.join("/") || "none"}`)
    .join(" | ");
  const shifts = profile.recentLocalShifts
    .slice(0, 6)
    .map((shift) => `${String(shift.fromTileId)}>${String(shift.toTileId)} d${shift.distance} ${shift.outcome}`)
    .join(" | ");
  const camps = profile.temporaryTaskCamps
    .slice(0, 6)
    .map((camp) => `${camp.purpose}:${camp.status}:${String(camp.targetTileId)}`)
    .join(" | ");
  const relief = profile.rangeRotation;
  const reliefCandidates = relief.candidates
    .slice(0, 8)
    .map((candidate) =>
      `${String(candidate.tileId)}:${candidate.status}:${candidate.actionStrategy}:relief ${formatCompactNumber(candidate.pressureReliefScore)}:useDiff ${formatCompactNumber(candidate.usePressureDifference)}:support ${formatCompactNumber(candidate.supportAdequacy)}:water ${formatCompactNumber(candidate.waterRefugeAdequacy)}:better ${String(candidate.betterThanCurrent)}:goodEnough ${String(candidate.goodEnoughRelief)}${candidate.blockedReason === undefined ? "" : `:blocked ${candidate.blockedReason}`}`,
    )
    .join(" | ");
  const reliefRejected = relief.rejectedCandidates
    .slice(0, 5)
    .map((candidate) => `${String(candidate.tileId)}:${candidate.status}:${candidate.blockedReason ?? candidate.reasonLabel}`)
    .join(" | ");

  return (
    <>
      <Detail label="status" value={`${profile.status} · behavior active ${String(profile.integrity.behaviorActive)} · traced ${String(profile.integrity.behaviorInfluenceTraced)}`} />
      <Detail label="overview" value={`${profile.overviewTitle} · ${profile.overviewLines.join(" ")}`} />
      <Detail
        label="counts"
        value={`local shifts ${profile.localCampShiftCount} · temporary camps ${profile.temporaryCampCount} · establishments ${profile.establishmentStateCount} · successes ${profile.establishmentSuccessCount} · failures ${profile.establishmentFailureCount} · recovery holds ${profile.recoveryHoldCount}`}
      />
      <Detail
        label="stagnation / collapse"
        value={`flags ${profile.stagnationFlagCount} · escape responses ${profile.stagnationEscapeResponseCount} · passive cases ${profile.passiveCollapseCaseCount} · suspicious ${profile.suspiciousPassiveCollapseCount} · oscillation ${profile.oscillationCaseCount}`}
      />
      <Detail
        label="range rotation / pressure relief"
        value={`cluster ${relief.currentLocalClusterId} · range ${relief.currentLocalRangeId} · current use ${formatCompactNumber(relief.currentUsePressure)} · saturation ${formatCompactNumber(relief.rangeSaturationPressure)} · candidates ${profile.reliefCandidateCount} · good-enough ${profile.goodEnoughReliefCandidateCount} · chosen relief moves ${profile.chosenReliefMoveCount} · rejected ${profile.rejectedReliefCandidateCount} · blocked ${profile.blockedReliefMoveCount} · scout bridges ${profile.scoutProbeBridgeCount}`}
      />
      <Detail
        label="local orbit trap"
        value={`detected ${String(relief.localOrbitTrap.detected)} · escalation ${relief.localOrbitTrap.escalation} · pressure ${formatCompactNumber(relief.localOrbitTrap.pressure)} · micro shifts ${relief.localOrbitTrap.recentMicroShiftCount} · distinct tiles ${relief.localOrbitTrap.recentDistinctTileCount} · same cluster ${String(relief.localOrbitTrap.sameClusterLoop)} · basis ${relief.localOrbitTrap.basis.join(" | ") || "none"}`}
      />
      <Detail
        label="escape target integrity"
        value={`with target ${profile.escapeResponsesWithTargetCount} · blocked ${profile.escapeResponsesBlockedCount} · targetless ${profile.targetlessEscapeAttemptCount} · repeated targetless ${profile.repeatedTargetlessEscapeAttemptCount} · latest blocked ${relief.targetIntegrity.latestBlockedReason ?? "none"}`}
      />
      <Detail
        label="old camp pull"
        value={`score ${formatCompactNumber(band.campMovement?.oldCampPullScore ?? 0)} · decay cases ${profile.oldCampDecayCount} · gradual ${String(profile.integrity.oldAnchorDecayGradual)}`}
      />
      <Detail
        label="establishment"
        value={establishment === undefined
          ? "none"
          : `${establishment.status} · scope ${establishment.scope} · cluster ${establishment.localClusterId} · age ${establishment.ageTicks} · confidence ${formatCompactNumber(establishment.confidence)} · recovery ${formatCompactNumber(establishment.recoveryNeed)} · carried ${String(establishment.establishmentCarriedOver)} · reset ${establishment.resetReason ?? "none"} · retreat ${formatCompactNumber(establishment.retreatRisk)} · no settlement ${String(establishment.noSettlement)}`}
      />
      <Detail
        label="establishment scope"
        value={`scope ${relief.establishmentScope.scope} · current cluster ${relief.establishmentScope.currentLocalClusterId} · previous cluster ${relief.establishmentScope.previousLocalClusterId ?? "none"} · same-cluster ${String(relief.establishmentScope.sameClusterShift)} · new-cluster ${String(relief.establishmentScope.newClusterMove)} · carried ${String(relief.establishmentScope.carriedOver)} · carry-over ${formatCompactNumber(relief.establishmentScope.carryOverAmount)} · reset ${relief.establishmentScope.resetReason ?? "none"}`}
      />
      <Detail
        label="source refs"
        value={`adaptive ${profile.adaptiveResponseRefCount} · foothold ${profile.footholdRefCount} · activity ${profile.activityRefCount} · events ${profile.eventRefCount} · movement reasons ${profile.movementReasonRefCount} · demography ${profile.demographyLaborRefCount}`}
      />
      <Detail
        label="behavior trace"
        value={latestTrace === undefined
          ? "none"
          : `${latestTrace.actionType} · ${latestTrace.scale} · delta ${formatCompactNumber(latestTrace.scoreDelta)} · target ${latestTrace.targetTileId === undefined ? "none" : String(latestTrace.targetTileId)} · basis ${latestTrace.basis.join(" | ") || "none"}`}
      />
      <Detail
        label="integrity"
        value={`local shifts distinct=${profile.integrity.localShiftDistinctFromRelocation} · temporary not settlement=${profile.integrity.temporaryCampsNotSettlement} · establishment not settlement=${profile.integrity.establishmentNotSettlement} · no new actions=${profile.integrity.noNewActions} · no new ecology=${profile.integrity.noNewEcology} · no settlement/inventory/property/agriculture/culture/territory=${profile.integrity.noSettlementInventoryPropertyAgricultureCultureTerritory}`}
      />
      <Detail
        label="payload / caps"
        value={`${formatBytes(profile.payloadBytesEstimate)} · max stored entries ${profile.maxStoredEntriesPerBand} · caps held ${String(profile.caps.capsHeld)} · local ${profile.caps.localShiftCap} · temporary ${profile.caps.temporaryCampCap} · decay ${profile.caps.oldCampDecayCap} · escape ${profile.caps.stagnationEscapeCap} · evidence/item ${profile.caps.evidencePerItemCap}`}
      />
      <Detail label="stagnation flags" value={profile.stagnationFlags.join(" | ") || "none"} />
      <Detail label="relief candidates" value={reliefCandidates || "none"} />
      <Detail label="rejected relief candidates" value={reliefRejected || "none"} />
      <Detail
        label="relief integrity"
        value={`goodEnoughSeparate=${String(relief.integrity.goodEnoughSeparateFromBetterThanCurrent)} · bounded=${String(relief.integrity.boundedBehaviorInfluence)} · noLongDistanceForced=${String(relief.integrity.noLongDistanceMigrationForced)} · riverRetained=${String(relief.integrity.riverFollowingRetained)} · noFissionChange=${String(relief.integrity.noFissionBehaviorChange)} · noNewEcology=${String(relief.integrity.noNewEcology)} · capsHeld=${String(relief.caps.capsHeld)} · radius ${relief.caps.searchRadiusTiles}`}
      />
      <Detail label="shift sample" value={shifts || "none"} />
      <Detail label="temporary camp sample" value={camps || "none"} />
      <Detail label="escape sample" value={escapes || "none"} />
      <Detail label="old camp sample" value={oldCamp || "none"} />
      <Detail label="local shift ids" value={profile.technicalProof.localShiftIds.join(" | ") || "none"} />
      <Detail label="temporary camp ids" value={profile.technicalProof.temporaryCampIds.join(" | ") || "none"} />
      <Detail label="old camp decay ids" value={profile.technicalProof.oldCampDecayIds.join(" | ") || "none"} />
      <Detail label="escape ids" value={profile.technicalProof.escapeIds.join(" | ") || "none"} />
      <Detail label="event refs" value={profile.technicalProof.eventRefs.join(" | ") || "none"} />
      <Detail label="foothold refs" value={profile.technicalProof.footholdRefs.join(" | ") || "none"} />
      <Detail label="adaptive refs" value={profile.technicalProof.adaptiveRefs.join(" | ") || "none"} />
    </>
  );
}

function SocialEcologicalDiffusionDetails({ band, world }: { readonly band: Band; readonly world: WorldState | null }) {
  if (world === null) {
    return <Detail label="social ecological diffusion" value="world unavailable" />;
  }

  const profile = deriveSocialEcologicalDiffusionProfile(world, band);
  const contexts = Object.entries(profile.contextKindCounts)
    .filter(([, count]) => count > 0)
    .map(([kind, count]) => `${kind.replace(/_/g, " ")} ${count}`)
    .join(" · ");
  const channels = Object.entries(profile.channelCounts)
    .filter(([, count]) => count > 0)
    .map(([channel, count]) => `${socialDiffusionChannelLabel(channel as Parameters<typeof socialDiffusionChannelLabel>[0])} ${count}`)
    .join(" · ");
  const domains = Object.entries(profile.domainCounts)
    .filter(([, count]) => count > 0)
    .map(([domain, count]) => `${socialDiffusionDomainLabel(domain as Parameters<typeof socialDiffusionDomainLabel>[0])} ${count}`)
    .join(" · ");
  const statuses = Object.entries(profile.statusCounts)
    .filter(([, count]) => count > 0)
    .map(([status, count]) => `${socialDiffusionStatusLabel(status as Parameters<typeof socialDiffusionStatusLabel>[0])} ${count}`)
    .join(" · ");
  const tacit = Object.entries(profile.tacitDifficultyCounts)
    .filter(([, count]) => count > 0)
    .map(([difficulty, count]) => `${socialDiffusionTacitDifficultyLabel(difficulty as Parameters<typeof socialDiffusionTacitDifficultyLabel>[0])} ${count}`)
    .join(" · ");
  const compatibility = Object.entries(profile.compatibilityCounts)
    .filter(([, count]) => count > 0)
    .map(([state, count]) => `${socialDiffusionCompatibilityLabel(state as Parameters<typeof socialDiffusionCompatibilityLabel>[0])} ${count}`)
    .join(" · ");
  const trust = Object.entries(profile.trustFilterCounts)
    .filter(([, count]) => count > 0)
    .map(([filter, count]) => `${socialDiffusionTrustFilterLabel(filter as Parameters<typeof socialDiffusionTrustFilterLabel>[0])} ${count}`)
    .join(" · ");
  const basis = Object.entries(profile.basisCounts)
    .filter(([, count]) => count > 0)
    .map(([entry, count]) => `${entry.replace(/_/g, " ")} ${count}`)
    .join(" · ");
  const sources = Object.entries(profile.sourceSystemCounts)
    .filter(([, count]) => count > 0)
    .map(([source, count]) => `${source.replace(/_/g, " ")} ${count}`)
    .join(" · ");
  const itemSummary = profile.diffusionItems
    .slice(0, 8)
    .map((item) => `${item.domain}:${item.channel}:${item.status}:${formatCompactNumber(item.confidence)} e${item.evidence.length}`)
    .join(" | ");

  return (
    <>
      <Detail label="projection" value={`${profile.socialContexts.length}/${profile.caps.socialContextCap} contexts · ${profile.diffusionItems.length}/${profile.caps.diffusionItemCap} diffusion items · per domain ${profile.caps.itemsPerDomainCap}`} />
      <Detail label="overview" value={`${profile.overviewTitle} · ${profile.overviewLines.join(" ")}`} />
      <Detail label="context kinds" value={contexts || "none"} />
      <Detail label="channels" value={channels || "none"} />
      <Detail label="domains" value={domains || "none"} />
      <Detail label="statuses" value={statuses || "none"} />
      <Detail label="tacit difficulty" value={tacit || "none"} />
      <Detail label="compatibility" value={compatibility || "none"} />
      <Detail label="trust / caution" value={trust || "none"} />
      <Detail label="inherited / lived basis" value={basis || "none"} />
      <Detail
        label="channel refs"
        value={`direct/contact ${profile.directContactRefCount} · activity/talk ${profile.activityTalkRefCount} · visible trace ${profile.visibleTraceRefCount} · parent/daughter ${profile.parentDaughterRefCount} · shared route/water ${profile.sharedRouteWaterRefCount}`}
      />
      <Detail
        label="source refs"
        value={`knowledge ${profile.knowledgeRefCount} · event ${profile.eventRefCount} · affordance ${profile.affordanceRefCount} · practice feedback ${profile.practiceFeedbackRefCount} · foothold ${profile.footholdRefCount}`}
      />
      <Detail
        label="diffusion risks"
        value={`failed imitation ${profile.failedImitationCount} · partial copy ${profile.partialCopyCount} · seen not understood ${profile.seenNotUnderstoodCount} · withholding ${profile.withholdingCount} · rejection ${profile.rejectionCount}`}
      />
      <Detail label="source systems" value={sources || "none"} />
      <Detail label="constraints" value={profile.constraints.join(" | ")} />
      <Detail
        label="caps"
        value={`contexts ${profile.caps.socialContextCap} · items ${profile.caps.diffusionItemCap} · per domain ${profile.caps.itemsPerDomainCap} · evidence/item ${profile.caps.evidencePerItemCap} · evidence/context ${profile.caps.evidencePerContextCap} · links ${profile.caps.linkPerItemCap} · records ${profile.caps.contextRecordCap} · held ${String(profile.caps.capsHeld)}`}
      />
      <Detail
        label="integrity"
        value={`selectedBandOnly=${profile.integrity.selectedBandOnly} · projectionOnly=${profile.integrity.projectionOnly} · noBehaviorInfluence=${profile.integrity.noBehaviorInfluence} · noDecisionInfluence=${profile.integrity.noDecisionInfluence} · antiOmniscient=${profile.integrity.antiOmniscient} · hiddenOtherBandState=${profile.integrity.noHiddenOtherBandInternalState}`}
      />
      <Detail
        label="interpretation guards"
        value={`inheritedSeparated=${profile.integrity.inheritedSeparated} · daughterLocalTesting=${profile.integrity.daughterParentKnowledgeNotLocalTesting} · tacit=${profile.integrity.tacitKnowledgeRepresented} · compatibility=${profile.integrity.compatibilityRepresented} · trust=${profile.integrity.trustCautionRepresented} · failedImitation=${profile.integrity.failedImitationRepresented}`}
      />
      <Detail
        label="deferred systems"
        value={`skills/adaptations=${profile.integrity.noSkillOrAdaptationState} · culture/taboo/myth/worldview/religion/language=${profile.integrity.noCultureTabooMythWorldviewReligionLanguage} · diplomacy/trade/war/territory/property=${profile.integrity.noDiplomacyAllianceTradeWarTerritoryProperty} · settlement/agriculture/domestication/inventory=${profile.integrity.noSettlementAgricultureDomesticationInventory}`}
      />
      <Detail label="chronicle integration" value={`${profile.chronicleIntegration.mode} · broken links ${profile.chronicleIntegration.brokenRenderedLinks} · ${profile.chronicleIntegration.reason}`} />
      <Detail
        label="payload estimate"
        value={`${formatBytes(profile.technicalProof.payloadBytesEstimate)} selected-band projection · max context ${formatBytes(profile.technicalProof.maxContextPayloadBytes)} · max item ${formatBytes(profile.technicalProof.maxItemPayloadBytes)}`}
      />
      <Detail
        label="claim guards"
        value={`fake diplomacy/trade/territory/culture ${profile.technicalProof.fakeDiplomacyTradeTerritoryCultureClaimCount} · fake skill/adaptation ${profile.technicalProof.fakeSkillAdaptationClaimCount} · hidden internal state ${profile.technicalProof.hiddenInternalStateExposureCount} · decision isolation ${String(profile.technicalProof.decisionPathIsolation)}`}
      />
      <Detail label="item sample" value={itemSummary || "none"} />
      <Detail label="source samples" value={profile.technicalProof.sourceIdSamples.join(" | ") || "none"} />
      <Detail label="context samples" value={profile.technicalProof.contextIdSamples.join(" | ") || "none"} />
      <Detail label="report samples" value={profile.technicalProof.reportIdSamples.join(" | ") || "none"} />
      <Detail label="knowledge samples" value={profile.technicalProof.knowledgeIdSamples.join(" | ") || "none"} />
      <Detail label="event samples" value={profile.technicalProof.eventIdSamples.join(" | ") || "none"} />
      <Detail label="activity samples" value={profile.technicalProof.activityIdSamples.join(" | ") || "none"} />
      <Detail label="affordance samples" value={profile.technicalProof.affordanceIdSamples.join(" | ") || "none"} />
      <Detail label="practice-feedback samples" value={profile.technicalProof.practiceFeedbackIdSamples.join(" | ") || "none"} />
      <Detail label="foothold samples" value={profile.technicalProof.footholdIdSamples.join(" | ") || "none"} />
    </>
  );
}

function PublicHumanStoryDetails({ band, world }: { readonly band: Band; readonly world: WorldState | null }) {
  if (world === null) {
    return <Detail label="public story layer" value="world unavailable" />;
  }

  const profile = derivePublicHumanStoryProfile(world, band);
  const proof = profile.technicalProof;
  const categories = Object.entries(proof.categoryCounts)
    .filter(([, count]) => count > 0)
    .map(([category, count]) => `${category.replace(/_/g, " ")} ${count}`)
    .join(" · ");
  const tones = Object.entries(proof.toneTierCounts)
    .filter(([, count]) => count > 0)
    .map(([tone, count]) => `${tone.replace(/_/g, " ")} ${count}`)
    .join(" · ");
  const storySample = profile.items
    .slice(0, 8)
    .map((item) => `${item.category}:${item.toneTier}:${item.templateId}:${item.status}`)
    .join(" | ");

  return (
    <>
      <Detail label="public story layer" value={`${proof.storyItemCount}/${proof.maxStoriesProfile} stories · templates used ${proof.templatesUsed.length} · skipped ${proof.skippedTemplates} · caps held ${String(proof.capsHeld)}`} />
      <Detail label="categories" value={categories || "none"} />
      <Detail label="tone tiers" value={tones || "none"} />
      <Detail
        label="concrete names"
        value={`objects ${proof.concreteObjectNameCount} · foods ${proof.concreteFoodNameCount} · fallback generic ${proof.fallbackGenericNameCount}`}
      />
      <Detail
        label="talk / conflict safety"
        value={`internal ${profile.internalTalks.length} · outer ${profile.outerTalks.length} · dormant conflict templates ${proof.dormantConflictTemplates} · active conflict events ${proof.activeConflictEvents} · dormant behavior influence ${proof.dormantConflictBehaviorInfluence}`}
      />
      <Detail
        label="grounding guards"
        value={`identity influenced ${proof.bandIdentityInfluencedStories} · skipped unsupported ${proof.skippedUnsupportedTemplates} · raw/debug leaks ${proof.rawDebugLeakCount} · unsupported fake terms ${proof.unsupportedFakeTermCount} · duplicate phrases ${proof.duplicatePhraseCount} · broken refs ${proof.brokenSourceRefCount}`}
      />
      <Detail
        label="behavior isolation"
        value={`public text affects behavior ${String(proof.publicStorySelectionAffectsBehavior)} · deterministic keys ${proof.deterministicKeySamples.length} · payload ${formatBytes(proof.maxPayloadBytes)}`}
      />
      <Detail label="templates used" value={proof.templatesUsed.join(" | ") || "none"} />
      <Detail label="story sample" value={storySample || "none"} />
      <Detail label="deterministic key samples" value={proof.deterministicKeySamples.join(" | ") || "none"} />
      <Detail label="source ref samples" value={proof.sourceRefSamples.join(" | ") || "none"} />
    </>
  );
}

function estimateJsonBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  }

  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${bytes} B`;
}

function formatOptionalNumber(value: number | undefined): string {
  return value === undefined ? "unknown" : formatCompactNumber(value);
}

function formatCompactNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function formatOptionalBoolean(value: boolean | undefined): string {
  return value === undefined ? "unknown" : String(value);
}

function getOldestPreservedHistoryYear(history: NonNullable<Band["deepHistory"]>): number | undefined {
  return getDeepHistoryYearRange(history)?.start;
}

function getDeepHistoryYearRange(history: NonNullable<Band["deepHistory"]>): { readonly start: number; readonly end: number } | undefined {
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
    return undefined;
  }

  return {
    start: Math.min(...years),
    end: Math.max(...years),
  };
}

function getRecentEventYearRange(band: Band): { readonly start: number; readonly end: number } | undefined {
  const years = (band.eventHistory?.last25Years ?? []).map((event) => event.year);

  if (years.length === 0) {
    return undefined;
  }

  return {
    start: Math.min(...years),
    end: Math.max(...years),
  };
}

function formatYearRange(range: { readonly start: number; readonly end: number } | undefined): string {
  if (range === undefined) {
    return "unknown";
  }

  return range.start === range.end ? `Y${range.start}` : `Y${range.start}-${range.end}`;
}

function summarizeDeepHistoryEvidence(history: NonNullable<Band["deepHistory"]>): string {
  const counts = new Map<string, number>();
  const add = (kind: string) => counts.set(kind, (counts.get(kind) ?? 0) + 1);

  for (const ref of history.founding.evidence) add(ref.kind);
  for (const era of history.eras) for (const ref of era.evidence) add(ref.kind);
  for (const episode of history.episodes) for (const ref of episode.evidence) add(ref.kind);
  for (const episode of history.inheritedEpisodes) for (const ref of episode.evidence) add(ref.kind);
  if (history.terminalRecord !== undefined) {
    for (const ref of history.terminalRecord.evidence) add(ref.kind);
  }

  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(0, 10)
    .map(([kind, count]) => `${kind} ${count}`)
    .join(" · ");
}

export function Technical({
  band,
  world,
  currentTile,
  latestDecision,
}: {
  readonly band: Band;
  readonly world: WorldState | null;
  readonly currentTile: Tile | undefined;
  readonly latestDecision: Decision | undefined;
}) {
  // READABILITY-UI-ORGANIZATION-1 follow-up: groups carry PLAIN names (no
  // checkpoint tags), related internals are merged into one group, and the
  // list is alphabetical. Nothing was deleted — every raw detail component
  // still mounts (lazily) inside exactly one group.
  return (
    <div className="band-technical">
      <p className="tech-note">Advanced / developer data — raw model internals, A→Z.</p>
      <CollapsibleGroup title="Access &amp; shared use">
        <ProtoAccessDetails band={band} />
        <RangeFrictionDetails band={band} world={world} />
      </CollapsibleGroup>
      <CollapsibleGroup title="Activity trips">
        <ActivityTraceDetails band={band} />
      </CollapsibleGroup>
      <CollapsibleGroup title="Acute risk &amp; hardship">
        <AcuteRiskDetails band={band} />
      </CollapsibleGroup>
      <CollapsibleGroup title="Body &amp; camp logistics">
        <BodyCampLogisticsDetails band={band} />
      </CollapsibleGroup>
      <CollapsibleGroup title="Camp &amp; place memory">
        <ProtoCampDetails band={band} />
      </CollapsibleGroup>
      <CollapsibleGroup title="Camp foothold / ecology / care substrate">
        <CampFootholdDetails band={band} world={world} />
      </CollapsibleGroup>
      <CollapsibleGroup title="Carrying capacity &amp; seasonal support">
        <CarryingCapacityDetails band={band} world={world} />
        <SeasonalSupportDetails band={band} />
      </CollapsibleGroup>
      <CollapsibleGroup title="Causal agency repair — hardship / tendencies / crossing practice">
        <CausalAgencyDetails band={band} world={world} latestDecision={latestDecision} />
        {band.practicalAdaptation === undefined ? <AdaptiveEfficacyDetails band={band} /> : null}
        <PracticalAdaptationDetails band={band} world={world} />
      </CollapsibleGroup>
      <CollapsibleGroup title="Condition profile">
        <BandConditionProfileDetails band={band} />
      </CollapsibleGroup>
      <CollapsibleGroup title="Deep history substrate">
        <DeepHistoryDetails band={band} />
      </CollapsibleGroup>
      <CollapsibleGroup title="Demography, births &amp; deaths">
        <DemographyFissionDetails band={band} world={world} />
        <DemographicChurnDetails band={band} />
        <NoDeathAuditDetails band={band} />
        <DeathMemoryDetails band={band} />
      </CollapsibleGroup>
      <CollapsibleGroup title="Dry-margin water">
        <DryMarginDetails band={band} latestDecision={latestDecision} />
      </CollapsibleGroup>
      <CollapsibleGroup title="Encounters &amp; contact">
        <EncounterContactDetails band={band} />
      </CollapsibleGroup>
      <CollapsibleGroup title="Events &amp; camp talk">
        <BandEventHistoryDetails band={band} />
        <CampRumorReadabilityDetails band={band} />
      </CollapsibleGroup>
      <CollapsibleGroup title="Event system substrate">
        <EventSystemDetails band={band} world={world} />
      </CollapsibleGroup>
      <CollapsibleGroup title="Band identity substrate">
        <BandIdentityDetails band={band} world={world} />
      </CollapsibleGroup>
      <CollapsibleGroup title="Knowledge ecology substrate">
        <KnowledgeEcologyDetails band={band} world={world} />
      </CollapsibleGroup>
      <CollapsibleGroup title="Knowledge carriers / availability substrate">
        <KnowledgeCarrierDetails band={band} world={world} />
      </CollapsibleGroup>
      <CollapsibleGroup title="Material affordance substrate">
        <MaterialAffordanceDetails band={band} world={world} />
      </CollapsibleGroup>
      {band.practicalAdaptation === undefined ? (
        <>
          <CollapsibleGroup title="Legacy problem projection adapter">
            <ProblemPracticeDetails band={band} world={world} />
          </CollapsibleGroup>
          <CollapsibleGroup title="Legacy practice-readiness adapter">
            <PracticeFeedbackReadinessDetails band={band} world={world} />
          </CollapsibleGroup>
          <CollapsibleGroup title="Legacy adaptive-idea adapter">
            <AdaptiveHumanDetails band={band} world={world} />
          </CollapsibleGroup>
        </>
      ) : null}
      <CollapsibleGroup title="Intra-season movement / establishment substrate">
        <CampMovementDetails band={band} world={world} />
      </CollapsibleGroup>
      <CollapsibleGroup title="History chronicle projection">
        <BandChronicleDetails band={band} world={world} />
      </CollapsibleGroup>
      {band.practicalAdaptation === undefined ? (
        <CollapsibleGroup title="Legacy public story adapter">
          <PublicHumanStoryDetails band={band} world={world} />
        </CollapsibleGroup>
      ) : null}
      <CollapsibleGroup title="Concrete memory referents">
        <MemoryReferentDetails band={band} world={world} />
      </CollapsibleGroup>
      <CollapsibleGroup title="Familiar country &amp; neighbouring ranges">
        <FamiliarCountryDetails band={band} world={world} />
        <KnownNeighbouringRangesDetails band={band} world={world} />
      </CollapsibleGroup>
      <CollapsibleGroup title="Foraging adaptation">
        <ForagingAdaptationDetails band={band} />
      </CollapsibleGroup>
      <CollapsibleGroup title="Frontier &amp; outward establishment">
        <RangeFrontierOpportunityDetails band={band} latestDecision={latestDecision} />
        <OutwardEstablishmentDetails band={band} world={world} />
      </CollapsibleGroup>
      <CollapsibleGroup title="Identity &amp; origin">
        <Detail label="name" value={band.name} />
        <Detail label="people" value={String(band.size)} />
        <Detail label="status" value={bandStatusLabel(band.status)} />
        <Detail label="way of life" value={mobilityLabel(band.mobilityStrategy)} />
        <Detail
          label="subsistence"
          value={band.subsistenceModes.map((mode) => subsistenceLabel(mode)).join(", ")}
        />
        <Detail
          label="legacy static spawn tags (not learned technology)"
          value={band.technologies.map((tech) => technologyLabel(tech)).join(", ")}
        />
        <Detail label="band id" value={String(band.id)} />
        <Detail label="tile" value={String(band.position)} />
        <SpawnReasonDetails band={band} />
      </CollapsibleGroup>
      <CollapsibleGroup title="Knowledge internals">
        <KnowledgeDetails band={band} />
        <DaughterInheritanceDetails band={band} />
      </CollapsibleGroup>
      <CollapsibleGroup title="Lineage">
        <LineageReadabilityDetails band={band} />
        <LineageInheritedRangeDetails band={band} world={world} />
        <LineageIdentityDetails band={band} world={world} />
      </CollapsibleGroup>
      <CollapsibleGroup title="Moves &amp; mobility basis">
        <ResidentialMoveTraceDetails band={band} />
        <MobilityBehaviorBasisDetails band={band} world={world} />
      </CollapsibleGroup>
      <CollapsibleGroup title="Performance &amp; payload diagnostics">
        <PerformancePayloadDetails band={band} world={world} />
      </CollapsibleGroup>
      <CollapsibleGroup title="Pressure, crowding &amp; causes">
        <CausalPressureDetails band={band} latestDecision={latestDecision} />
        <CrowdingDetails band={band} world={world} latestDecision={latestDecision} />
      </CollapsibleGroup>
      <CollapsibleGroup title="Relationships &amp; practical memory">
        <RelationshipMemoryDetails band={band} />
      </CollapsibleGroup>
      <CollapsibleGroup title="Reports &amp; shared knowledge">
        <ReportedKnowledgeDetails band={band} world={world} />
      </CollapsibleGroup>
      <CollapsibleGroup title="Resource ecology &amp; storage">
        <ResourceEcologyDetails band={band} />
      </CollapsibleGroup>
      <CollapsibleGroup title="Seasonal round &amp; ecology memory">
        <SeasonalRoundDetails band={band} world={world} />
        <SeasonalEcologyDetails band={band} world={world} />
      </CollapsibleGroup>
      <CollapsibleGroup title="Social-ecological diffusion substrate">
        <SocialEcologicalDiffusionDetails band={band} world={world} />
      </CollapsibleGroup>
      <CollapsibleGroup title="Social tension &amp; inner fission">
        <SocialTensionDetails band={band} />
        <InnerFissionDetails band={band} />
      </CollapsibleGroup>
      <CollapsibleGroup title="Visible landscape &amp; nature">
        <VisibleLandscapeDetails band={band} />
        <VisibleNatureDetails band={band} />
        <AnimalLearningManagementDetails band={band} />
      </CollapsibleGroup>
      <CollapsibleGroup title="Weak-band fate">
        <BandViabilityDetails band={band} />
      </CollapsibleGroup>
      <CollapsibleGroup title="World truth (debug)">
        <WorldEcologyDebugDetails />
        <PlantPatchTruthDetails currentTile={currentTile} world={world} />
      </CollapsibleGroup>
    </div>
  );
}
