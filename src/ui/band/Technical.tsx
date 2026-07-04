import type { Band } from "../../sim/agents/types";
import { deriveBandChronicle } from "../../sim/agents/bandChronicle";
import { deriveBandIdentityProfile } from "../../sim/agents/bandIdentity";
import { deriveCanonicalEvents, familyLabel } from "../../sim/agents/eventSystem";
import { deriveMemoryReferents } from "../../sim/agents/memoryReferents";
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
    </>
  );
}

function PerformancePayloadDetails({ band }: { readonly band: Band }) {
  const selectedBandBytes = estimateJsonBytes(band);
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
      <Detail label="selected-band payload" value={`${formatBytes(selectedBandBytes)} estimated JSON`} />
      <Detail
        label="panel payload estimates"
        value={`overview ${formatBytes(panelPayloads.overview)} · nature ${formatBytes(panelPayloads.nature)} · history ${formatBytes(panelPayloads.history)} · technical raw ${formatBytes(panelPayloads.technicalRaw)}`}
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
      <Detail label="render policy" value="hidden tabs are not mounted; collapsed Technical sections lazy-mount raw proof on expansion" />
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
      <CollapsibleGroup title="Carrying capacity &amp; seasonal support">
        <CarryingCapacityDetails band={band} world={world} />
        <SeasonalSupportDetails band={band} />
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
      <CollapsibleGroup title="History chronicle projection">
        <BandChronicleDetails band={band} world={world} />
      </CollapsibleGroup>
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
          label="technologies"
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
        <PerformancePayloadDetails band={band} />
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
      <CollapsibleGroup title="Social tension &amp; inner fission">
        <SocialTensionDetails band={band} />
        <InnerFissionDetails band={band} />
      </CollapsibleGroup>
      <CollapsibleGroup title="Visible landscape &amp; nature">
        <VisibleLandscapeDetails band={band} />
        <VisibleNatureDetails band={band} />
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
