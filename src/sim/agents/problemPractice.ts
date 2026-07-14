import type { BandId, ReasonId, RouteId, TileId } from "../core/types";
import type { NormalizedIntensity } from "../rules/types";
import type { WorldState } from "../world/types";
import { deriveBandIdentityProfile, type BandIdentityCard } from "./bandIdentity";
import { deriveCanonicalEvents, type CanonicalEvent } from "./eventSystem";
import { deriveKnowledgeEcologyProfile, type KnowledgeEcologyItem } from "./knowledgeEcology";
import {
  deriveMaterialAffordanceProfile,
  type MaterialAffordanceFamily,
  type MaterialAffordanceItem,
  type MaterialAffordanceStatus,
} from "./materialAffordance";
import type {
  Band,
  IntraSeasonTripRecord,
  IntraSeasonTripTaskGroupType,
  KnownBandContactMemory,
  KnownCrossingMemory,
  PlaceMemoryRecord,
  RepetitionAffordanceItem,
  ResidentialMoveEvent,
  TravelCorridorMemory,
} from "./types";

const PROBLEM_FRAME_CAP = 6;
const PRACTICE_CANDIDATE_CAP = 9;
const EVIDENCE_PER_FRAME_CAP = 3;
const EVIDENCE_PER_CANDIDATE_CAP = 3;
const BASIS_PER_CANDIDATE_CAP = 4;
const RELATED_LINK_CAP = 4;
const CONTEXT_RECORD_CAP = 16;
const SAMPLE_CAP = 12;

export type ProblemFrameFamily =
  | "food_return_subsistence"
  | "carrying_logistical_burden"
  | "crossing_blocked_path"
  | "route_new_country_uncertainty"
  | "camp_setup_care_burden"
  | "water_refuge_pressure"
  | "social_contact_uncertainty";

export type ProblemFrameSourceSystem =
  | "canonical_event"
  | "knowledge_ecology"
  | "activity_party"
  | "activity_summary"
  | "place_memory"
  | "route_memory"
  | "crossing_memory"
  | "residential_move"
  | "demography"
  | "seasonal_support"
  | "body_camp_logistics"
  | "foraging_adaptation"
  | "contact_memory"
  | "reported_knowledge"
  | "band_identity"
  | "material_affordance";

export type ProblemFrameEvidenceKind =
  | "event"
  | "knowledge"
  | "activity"
  | "memory"
  | "demography"
  | "seasonal_support"
  | "repetition"
  | "contact"
  | "identity"
  | "affordance";

export type ProblemFrameLivedBasis = "lived" | "inherited_not_lived" | "mixed" | "unknown";

export type PracticeExperimentFamily =
  | "carrying_container_cordage"
  | "food_processing_trial"
  | "crossing_route_trial"
  | "camp_shelter_care_trial"
  | "fire_hearth_fuel_trial"
  | "water_edge_capture_trial"
  | "tool_digging_cutting_trial";

export type PracticeExperimentStatus =
  | "plausible_untried"
  | "implicit_repetition"
  | "low_feedback_repetition"
  | "blocked_by_missing_material"
  | "blocked_by_labor"
  | "inherited_not_tested_here"
  | "currently_unsupported"
  | "dead_end_risk"
  | "false_confidence_risk"
  | "local_only"
  | "uncertain";

export type PracticeFeedbackType =
  | "clear_success"
  | "clear_failure"
  | "mixed_feedback"
  | "low_feedback"
  | "delayed_feedback"
  | "dangerous_feedback"
  | "local_only_success"
  | "inherited_no_local_feedback"
  | "contradicted_by_recent_events";

export type PracticeRiskLevel = "low" | "present" | "high";

export interface ProblemPracticeEvidenceRef {
  readonly kind: ProblemFrameEvidenceKind;
  readonly sourceSystem: ProblemFrameSourceSystem;
  readonly label: string;
  readonly sourceId: string;
  readonly confidence: NormalizedIntensity;
  readonly livedBasis: ProblemFrameLivedBasis;
  readonly eventId?: string;
  readonly knowledgeId?: string;
  readonly affordanceId?: string;
  readonly activityId?: string;
  readonly repetitionId?: string;
  readonly tileId?: TileId;
  readonly routeId?: RouteId;
  readonly reasonIds: readonly ReasonId[];
}

export interface ProblemFrame {
  readonly id: string;
  readonly family: ProblemFrameFamily;
  readonly publicLabel: string;
  readonly meaning: string;
  readonly objectiveBasis: readonly string[];
  readonly perceivedCause: string;
  readonly confidence: NormalizedIntensity;
  readonly uncertainty: string;
  readonly possibleMisread: string;
  readonly evidence: readonly ProblemPracticeEvidenceRef[];
  readonly sourceSystems: readonly ProblemFrameSourceSystem[];
  readonly livedBasis: ProblemFrameLivedBasis;
  readonly livedEvidenceCount: number;
  readonly inheritedEvidenceCount: number;
  readonly relatedAffordanceIds: readonly string[];
  readonly relatedKnowledgeIds: readonly string[];
  readonly relatedEventIds: readonly string[];
  readonly relatedActivityIds: readonly string[];
  readonly relatedRepetitionIds: readonly string[];
  readonly possibleExperimentHooks: readonly PracticeExperimentFamily[];
  readonly noDecisionInfluence: true;
}

export interface PracticeExperimentCandidate {
  readonly id: string;
  readonly family: PracticeExperimentFamily;
  readonly publicLabel: string;
  readonly meaning: string;
  readonly problemFrameId: string;
  readonly problemFamily: ProblemFrameFamily;
  readonly relatedAffordanceIds: readonly string[];
  readonly relatedKnowledgeIds: readonly string[];
  readonly relatedEventIds: readonly string[];
  readonly relatedActivityIds: readonly string[];
  readonly relatedRepetitionIds: readonly string[];
  readonly materialBasis: readonly string[];
  readonly knowledgeBasis: readonly string[];
  readonly activityRepetitionBasis: readonly string[];
  readonly expectedFeedbackType: PracticeFeedbackType;
  readonly likelyCostRisk: string;
  readonly laborBurden: string;
  readonly confidence: NormalizedIntensity;
  readonly uncertainty: string;
  readonly deadEndRisk: PracticeRiskLevel;
  readonly falseConfidenceRisk: PracticeRiskLevel;
  readonly lowFeedbackRisk: PracticeRiskLevel;
  readonly localOnlyRisk: PracticeRiskLevel;
  readonly status: PracticeExperimentStatus;
  readonly evidence: readonly ProblemPracticeEvidenceRef[];
  readonly noSkillUnlocked: true;
  readonly noAutomaticImprovement: true;
  readonly futureHook: "practice_learning_candidate";
}

export interface ProblemPracticeProfile {
  readonly bandId: BandId;
  readonly generatedAtTick: number;
  readonly generatedAtYear: number;
  readonly projectionMode: "selected_band_projection";
  readonly overviewTitle: string;
  readonly overviewLines: readonly string[];
  readonly problemFrames: readonly ProblemFrame[];
  readonly practiceCandidates: readonly PracticeExperimentCandidate[];
  readonly problemFamilyCounts: Readonly<Record<ProblemFrameFamily, number>>;
  readonly candidateFamilyCounts: Readonly<Record<PracticeExperimentFamily, number>>;
  readonly perceivedCauseCounts: Readonly<Record<string, number>>;
  readonly sourceSystemCounts: Readonly<Record<ProblemFrameSourceSystem, number>>;
  readonly feedbackTypeCounts: Readonly<Record<PracticeFeedbackType, number>>;
  readonly statusCounts: Readonly<Record<PracticeExperimentStatus, number>>;
  readonly uncertaintyMisreadCount: number;
  readonly affordanceRefCount: number;
  readonly knowledgeRefCount: number;
  readonly eventRefCount: number;
  readonly activityRefCount: number;
  readonly repetitionRefCount: number;
  readonly inheritedBasisCount: number;
  readonly livedBasisCount: number;
  readonly deadEndRiskCount: number;
  readonly falseConfidenceRiskCount: number;
  readonly lowFeedbackRiskCount: number;
  readonly localOnlyRiskCount: number;
  readonly constraints: readonly string[];
  readonly caps: {
    readonly problemFrameCap: number;
    readonly practiceCandidateCap: number;
    readonly evidencePerFrameCap: number;
    readonly evidencePerCandidateCap: number;
    readonly basisPerCandidateCap: number;
    readonly relatedLinkCap: number;
    readonly contextRecordCap: number;
    readonly capsHeld: boolean;
  };
  readonly integrity: {
    readonly selectedBandOnly: true;
    readonly projectionOnly: true;
    readonly noBehaviorInfluence: true;
    readonly noDecisionInfluence: true;
    readonly noSkillOrAdaptationState: true;
    readonly noAutomaticImprovement: true;
    readonly noCultureTabooMythWorldviewLanguage: true;
    readonly noAgricultureSettlementTerritoryWar: true;
    readonly ignoresLegacyStartingSkills: true;
    readonly inheritedSeparated: boolean;
    readonly daughterParentKnowledgeNotTreatedAsTestedHere: boolean;
    readonly repetitionIsNotMastery: true;
    readonly candidatesRequireProblemBasis: boolean;
  };
  readonly chronicleIntegration: {
    readonly mode: "inspected_skipped";
    readonly reason: string;
    readonly brokenRenderedLinks: 0;
  };
  readonly technicalProof: {
    readonly payloadBytesEstimate: number;
    readonly maxFramePayloadBytes: number;
    readonly maxCandidatePayloadBytes: number;
    readonly sourceIdSamples: readonly string[];
    readonly affordanceIdSamples: readonly string[];
    readonly knowledgeIdSamples: readonly string[];
    readonly eventIdSamples: readonly string[];
    readonly activityIdSamples: readonly string[];
    readonly repetitionIdSamples: readonly string[];
    readonly legacyStartingSkillProofCount: 0;
    readonly fakeSkillStateCount: 0;
    readonly decisionPathIsolation: true;
  };
}

interface ProblemPracticeContext {
  readonly world: WorldState;
  readonly band: Band;
  readonly events: readonly CanonicalEvent[];
  readonly knowledgeItems: readonly KnowledgeEcologyItem[];
  readonly affordances: readonly MaterialAffordanceItem[];
  readonly identityCards: readonly BandIdentityCard[];
  readonly trips: readonly IntraSeasonTripRecord[];
  readonly moves: readonly ResidentialMoveEvent[];
  readonly places: readonly PlaceMemoryRecord[];
  readonly routes: readonly TravelCorridorMemory[];
  readonly crossings: readonly KnownCrossingMemory[];
  readonly repetitions: readonly RepetitionAffordanceItem[];
  readonly contacts: readonly KnownBandContactMemory[];
}

interface ProblemFrameDraft {
  readonly family: ProblemFrameFamily;
  readonly publicLabel: string;
  readonly meaning: string;
  readonly perceivedCause: string;
  readonly uncertainty: string;
  readonly possibleMisread: string;
  readonly evidence: readonly ProblemPracticeEvidenceRef[];
  readonly relatedAffordanceFamilies: readonly MaterialAffordanceFamily[];
  readonly possibleExperimentHooks: readonly PracticeExperimentFamily[];
  readonly score: number;
}

interface CandidateSpec {
  readonly family: PracticeExperimentFamily;
  readonly publicLabel: string;
  readonly meaning: string;
  readonly frameFamilies: readonly ProblemFrameFamily[];
  readonly affordanceFamilies: readonly MaterialAffordanceFamily[];
  readonly likelyCostRisk: string;
  readonly laborBurden: string;
  readonly fallbackFeedback: PracticeFeedbackType;
}

const PROBLEM_FAMILY_ORDER: readonly ProblemFrameFamily[] = [
  "food_return_subsistence",
  "carrying_logistical_burden",
  "crossing_blocked_path",
  "route_new_country_uncertainty",
  "camp_setup_care_burden",
  "water_refuge_pressure",
  "social_contact_uncertainty",
];

const CANDIDATE_FAMILY_ORDER: readonly PracticeExperimentFamily[] = [
  "carrying_container_cordage",
  "food_processing_trial",
  "crossing_route_trial",
  "camp_shelter_care_trial",
  "fire_hearth_fuel_trial",
  "water_edge_capture_trial",
  "tool_digging_cutting_trial",
];

const EMPTY_PROBLEM_FAMILY_COUNTS: Readonly<Record<ProblemFrameFamily, number>> = {
  food_return_subsistence: 0,
  carrying_logistical_burden: 0,
  crossing_blocked_path: 0,
  route_new_country_uncertainty: 0,
  camp_setup_care_burden: 0,
  water_refuge_pressure: 0,
  social_contact_uncertainty: 0,
};

const EMPTY_CANDIDATE_FAMILY_COUNTS: Readonly<Record<PracticeExperimentFamily, number>> = {
  carrying_container_cordage: 0,
  food_processing_trial: 0,
  crossing_route_trial: 0,
  camp_shelter_care_trial: 0,
  fire_hearth_fuel_trial: 0,
  water_edge_capture_trial: 0,
  tool_digging_cutting_trial: 0,
};

const EMPTY_SOURCE_COUNTS: Readonly<Record<ProblemFrameSourceSystem, number>> = {
  canonical_event: 0,
  knowledge_ecology: 0,
  activity_party: 0,
  activity_summary: 0,
  place_memory: 0,
  route_memory: 0,
  crossing_memory: 0,
  residential_move: 0,
  demography: 0,
  seasonal_support: 0,
  body_camp_logistics: 0,
  foraging_adaptation: 0,
  contact_memory: 0,
  reported_knowledge: 0,
  band_identity: 0,
  material_affordance: 0,
};

const EMPTY_FEEDBACK_COUNTS: Readonly<Record<PracticeFeedbackType, number>> = {
  clear_success: 0,
  clear_failure: 0,
  mixed_feedback: 0,
  low_feedback: 0,
  delayed_feedback: 0,
  dangerous_feedback: 0,
  local_only_success: 0,
  inherited_no_local_feedback: 0,
  contradicted_by_recent_events: 0,
};

const EMPTY_STATUS_COUNTS: Readonly<Record<PracticeExperimentStatus, number>> = {
  plausible_untried: 0,
  implicit_repetition: 0,
  low_feedback_repetition: 0,
  blocked_by_missing_material: 0,
  blocked_by_labor: 0,
  inherited_not_tested_here: 0,
  currently_unsupported: 0,
  dead_end_risk: 0,
  false_confidence_risk: 0,
  local_only: 0,
  uncertain: 0,
};

const CANDIDATE_SPECS: readonly CandidateSpec[] = [
  {
    family: "carrying_container_cordage",
    publicLabel: "Try bundling carried loads differently",
    meaning: "Carrying pressure could make tying, wrapping, or temporary containers worth testing, but no carrying method is established.",
    frameFamilies: ["carrying_logistical_burden", "food_return_subsistence", "camp_setup_care_burden"],
    affordanceFamilies: ["carrying_containers_cordage"],
    likelyCostRisk: "material may break, loads may still spill, and the trial can steal time from food work",
    laborBurden: "moderate extra hand work during trips or after camp setup",
    fallbackFeedback: "mixed_feedback",
  },
  {
    family: "food_processing_trial",
    publicLabel: "Try preparing hard or low-return foods near camp",
    meaning: "Food pressure could make pounding, roasting, drying, or soaking questions plausible where the material and knowledge basis exists.",
    frameFamilies: ["food_return_subsistence", "camp_setup_care_burden", "water_refuge_pressure"],
    affordanceFamilies: ["food_processing"],
    likelyCostRisk: "results may be delayed, uncertain, or unsafe if the food problem is misunderstood",
    laborBurden: "high camp labor if repeated without clear returns",
    fallbackFeedback: "delayed_feedback",
  },
  {
    family: "crossing_route_trial",
    publicLabel: "Try safer timing, approach, or load order on a crossing",
    meaning: "Crossing and route pressure can make practical route trials visible without creating bridges, boats, or travel mastery.",
    frameFamilies: ["crossing_blocked_path", "route_new_country_uncertainty", "carrying_logistical_burden"],
    affordanceFamilies: ["route_crossing_engineering"],
    likelyCostRisk: "mistakes can cost time, split loads, or expose the whole band at the water edge",
    laborBurden: "episodic but intense when the band moves",
    fallbackFeedback: "mixed_feedback",
  },
  {
    family: "camp_shelter_care_trial",
    publicLabel: "Try repeating a better camp setup or care routine",
    meaning: "Repeated camp work and care pressure can become a routine question, but this is still only a trial candidate.",
    frameFamilies: ["camp_setup_care_burden", "carrying_logistical_burden", "water_refuge_pressure"],
    affordanceFamilies: ["shelter_camp_structure", "camp_organization_care"],
    likelyCostRisk: "low-feedback routines can feel familiar even if they do not solve the pressure",
    laborBurden: "steady background labor around camp",
    fallbackFeedback: "low_feedback",
  },
  {
    family: "fire_hearth_fuel_trial",
    publicLabel: "Try planning fuel or hearth placement differently",
    meaning: "Fuel, food work, and camp return can make hearth-placement or fuel-planning questions visible beyond baseline fire competence.",
    frameFamilies: ["camp_setup_care_burden", "food_return_subsistence", "water_refuge_pressure"],
    affordanceFamilies: ["fire_hearth_fuel"],
    likelyCostRisk: "fuel planning may help only in the local season and can add gathering burden",
    laborBurden: "low to moderate repeated camp labor",
    fallbackFeedback: "low_feedback",
  },
  {
    family: "water_edge_capture_trial",
    publicLabel: "Try a repeated water-edge capture routine",
    meaning: "Water-edge work can suggest barriers, traps, or repeated edge routines, but no fishing or trapping method is known from this.",
    frameFamilies: ["water_refuge_pressure", "food_return_subsistence", "crossing_blocked_path"],
    affordanceFamilies: ["water_edge_trapping"],
    likelyCostRisk: "success can be local or seasonal, and poor feedback may be mistaken for method knowledge",
    laborBurden: "moderate work near water with possible travel or exposure cost",
    fallbackFeedback: "local_only_success",
  },
  {
    family: "tool_digging_cutting_trial",
    publicLabel: "Try digging, cutting, or scraping aids for food and camp work",
    meaning: "Roots, plant work, cutting, scraping, or repair can make tool-use questions plausible without creating an inventory or craft system.",
    frameFamilies: ["food_return_subsistence", "camp_setup_care_burden", "carrying_logistical_burden"],
    affordanceFamilies: ["tool_cutting_scraping_digging"],
    likelyCostRisk: "poor material or wrong use can waste labor or reinforce a bad routine",
    laborBurden: "moderate making and repair effort before any benefit is clear",
    fallbackFeedback: "mixed_feedback",
  },
];

export function deriveProblemPracticeProfile(world: WorldState, band: Band): ProblemPracticeProfile {
  const eventState = deriveCanonicalEvents(world, band);
  const knowledgeProfile = deriveKnowledgeEcologyProfile(world, band);
  const materialProfile = deriveMaterialAffordanceProfile(world, band);
  const identityProfile = deriveBandIdentityProfile(world, band);
  const context: ProblemPracticeContext = {
    world,
    band,
    events: eventState.events,
    knowledgeItems: knowledgeProfile.items,
    affordances: materialProfile.items,
    identityCards: identityProfile.cards,
    trips: [...(band.recentIntraSeasonTrips ?? [])]
      .sort((left, right) => Number(right.tick) - Number(left.tick) || String(left.targetTileId).localeCompare(String(right.targetTileId)))
      .slice(0, CONTEXT_RECORD_CAP),
    moves: [...(band.recentResidentialMoveEvents ?? [])]
      .sort((left, right) => Number(right.tick) - Number(left.tick) || String(left.eventId).localeCompare(String(right.eventId)))
      .slice(0, CONTEXT_RECORD_CAP),
    places: Object.values(band.placeMemory).sort(comparePlaceMemory).slice(0, CONTEXT_RECORD_CAP),
    routes: Object.values(band.travelCorridors).sort(compareRouteMemory).slice(0, CONTEXT_RECORD_CAP),
    crossings: Object.values(band.crossingMemories).sort(compareCrossingMemory).slice(0, CONTEXT_RECORD_CAP),
    repetitions: [...(band.foragingAdaptation?.repetitionAffordances ?? [])]
      .sort(compareRepetitionAffordance)
      .slice(0, CONTEXT_RECORD_CAP),
    contacts: Object.values(band.contactMemories).sort(compareContactMemory).slice(0, CONTEXT_RECORD_CAP),
  };
  const frameDrafts = [
    buildFoodFrame(context),
    buildCarryingFrame(context),
    buildCrossingFrame(context),
    buildRouteFrame(context),
    buildCampFrame(context),
    buildWaterFrame(context),
    buildSocialFrame(context),
  ].filter((draft): draft is ProblemFrameDraft => draft !== undefined);
  const problemFrames = capFrameDrafts(frameDrafts).map((draft) => finalizeFrame(context, draft));
  const practiceCandidates = buildPracticeCandidates(context, problemFrames);
  const allEvidence = [
    ...problemFrames.flatMap((frame) => frame.evidence),
    ...practiceCandidates.flatMap((candidate) => candidate.evidence),
  ];
  const problemFamilyCounts = countProblemFamilies(problemFrames);
  const candidateFamilyCounts = countCandidateFamilies(practiceCandidates);
  const sourceSystemCounts = countSourceSystems(allEvidence);
  const feedbackTypeCounts = countFeedbackTypes(practiceCandidates);
  const statusCounts = countStatuses(practiceCandidates);
  const perceivedCauseCounts = countStrings(problemFrames.map((frame) => frame.perceivedCause));
  const constraints = collectConstraints(context, problemFrames, practiceCandidates);
  const payloadBytesEstimate = byteLengthUtf8(JSON.stringify({
    bandId: band.id,
    generatedAtTick: world.time.tick,
    problemFrames,
    practiceCandidates,
  }));
  const framePayloads = problemFrames.map((frame) => byteLengthUtf8(JSON.stringify(frame)));
  const candidatePayloads = practiceCandidates.map((candidate) => byteLengthUtf8(JSON.stringify(candidate)));
  const inheritedBasisCount = allEvidence.filter((entry) => entry.livedBasis === "inherited_not_lived").length;
  const livedBasisCount = allEvidence.filter((entry) => entry.livedBasis === "lived" || entry.livedBasis === "mixed").length;

  return {
    bandId: band.id,
    generatedAtTick: Number(world.time.tick),
    generatedAtYear: world.time.year,
    projectionMode: "selected_band_projection",
    overviewTitle: buildOverviewTitle(problemFrames, practiceCandidates),
    overviewLines: buildOverviewLines(problemFrames, practiceCandidates),
    problemFrames,
    practiceCandidates,
    problemFamilyCounts,
    candidateFamilyCounts,
    perceivedCauseCounts,
    sourceSystemCounts,
    feedbackTypeCounts,
    statusCounts,
    uncertaintyMisreadCount: problemFrames.filter((frame) => frame.uncertainty.length > 0 || frame.possibleMisread.length > 0).length,
    affordanceRefCount: countUnique([
      ...problemFrames.flatMap((frame) => frame.relatedAffordanceIds),
      ...practiceCandidates.flatMap((candidate) => candidate.relatedAffordanceIds),
    ]),
    knowledgeRefCount: countUnique([
      ...problemFrames.flatMap((frame) => frame.relatedKnowledgeIds),
      ...practiceCandidates.flatMap((candidate) => candidate.relatedKnowledgeIds),
    ]),
    eventRefCount: countUnique([
      ...problemFrames.flatMap((frame) => frame.relatedEventIds),
      ...practiceCandidates.flatMap((candidate) => candidate.relatedEventIds),
    ]),
    activityRefCount: countUnique([
      ...problemFrames.flatMap((frame) => frame.relatedActivityIds),
      ...practiceCandidates.flatMap((candidate) => candidate.relatedActivityIds),
    ]),
    repetitionRefCount: countUnique([
      ...problemFrames.flatMap((frame) => frame.relatedRepetitionIds),
      ...practiceCandidates.flatMap((candidate) => candidate.relatedRepetitionIds),
    ]),
    inheritedBasisCount,
    livedBasisCount,
    deadEndRiskCount: practiceCandidates.filter((candidate) => candidate.deadEndRisk !== "low").length,
    falseConfidenceRiskCount: practiceCandidates.filter((candidate) => candidate.falseConfidenceRisk !== "low").length,
    lowFeedbackRiskCount: practiceCandidates.filter((candidate) => candidate.lowFeedbackRisk !== "low").length,
    localOnlyRiskCount: practiceCandidates.filter((candidate) => candidate.localOnlyRisk !== "low").length,
    constraints,
    caps: {
      problemFrameCap: PROBLEM_FRAME_CAP,
      practiceCandidateCap: PRACTICE_CANDIDATE_CAP,
      evidencePerFrameCap: EVIDENCE_PER_FRAME_CAP,
      evidencePerCandidateCap: EVIDENCE_PER_CANDIDATE_CAP,
      basisPerCandidateCap: BASIS_PER_CANDIDATE_CAP,
      relatedLinkCap: RELATED_LINK_CAP,
      contextRecordCap: CONTEXT_RECORD_CAP,
      capsHeld: problemFrames.length <= PROBLEM_FRAME_CAP &&
        practiceCandidates.length <= PRACTICE_CANDIDATE_CAP &&
        problemFrames.every((frame) =>
          frame.evidence.length <= EVIDENCE_PER_FRAME_CAP &&
          frame.relatedAffordanceIds.length <= RELATED_LINK_CAP &&
          frame.relatedKnowledgeIds.length <= RELATED_LINK_CAP &&
          frame.relatedEventIds.length <= RELATED_LINK_CAP &&
          frame.relatedActivityIds.length <= RELATED_LINK_CAP &&
          frame.relatedRepetitionIds.length <= RELATED_LINK_CAP) &&
        practiceCandidates.every((candidate) =>
          candidate.evidence.length <= EVIDENCE_PER_CANDIDATE_CAP &&
          candidate.materialBasis.length <= BASIS_PER_CANDIDATE_CAP &&
          candidate.knowledgeBasis.length <= BASIS_PER_CANDIDATE_CAP &&
          candidate.activityRepetitionBasis.length <= BASIS_PER_CANDIDATE_CAP &&
          candidate.relatedAffordanceIds.length <= RELATED_LINK_CAP &&
          candidate.relatedKnowledgeIds.length <= RELATED_LINK_CAP &&
          candidate.relatedEventIds.length <= RELATED_LINK_CAP &&
          candidate.relatedActivityIds.length <= RELATED_LINK_CAP &&
          candidate.relatedRepetitionIds.length <= RELATED_LINK_CAP),
    },
    integrity: {
      selectedBandOnly: true,
      projectionOnly: true,
      noBehaviorInfluence: true,
      noDecisionInfluence: true,
      noSkillOrAdaptationState: true,
      noAutomaticImprovement: true,
      noCultureTabooMythWorldviewLanguage: true,
      noAgricultureSettlementTerritoryWar: true,
      ignoresLegacyStartingSkills: true,
      inheritedSeparated: problemFrames.every((frame) => frame.inheritedEvidenceCount === 0 || frame.livedBasis !== "unknown") &&
        practiceCandidates.every((candidate) => !candidate.evidence.some((entry) => entry.livedBasis === "inherited_not_lived") || candidate.status === "inherited_not_tested_here" || candidate.evidence.some((entry) => entry.livedBasis === "lived" || entry.livedBasis === "mixed")),
      daughterParentKnowledgeNotTreatedAsTestedHere: band.parentBandId === undefined ||
        problemFrames.every((frame) => frame.inheritedEvidenceCount === 0 || frame.livedEvidenceCount > 0 || frame.livedBasis === "inherited_not_lived") &&
        practiceCandidates.every((candidate) => !candidate.evidence.some((entry) => entry.livedBasis === "inherited_not_lived") || candidate.status === "inherited_not_tested_here" || candidate.evidence.some((entry) => entry.livedBasis === "lived" || entry.livedBasis === "mixed")),
      repetitionIsNotMastery: true,
      candidatesRequireProblemBasis: practiceCandidates.every((candidate) =>
        problemFrames.some((frame) => frame.id === candidate.problemFrameId)),
    },
    chronicleIntegration: {
      mode: "inspected_skipped",
      reason: "Problem framing is kept in Problems & Trials and Technical; Chronicle prose is not expanded to avoid adding speculative narration before attempts become historical events.",
      brokenRenderedLinks: 0,
    },
    technicalProof: {
      payloadBytesEstimate,
      maxFramePayloadBytes: Math.max(0, ...framePayloads),
      maxCandidatePayloadBytes: Math.max(0, ...candidatePayloads),
      sourceIdSamples: capStrings(allEvidence.map((entry) => entry.sourceId), SAMPLE_CAP),
      affordanceIdSamples: capStrings([
        ...problemFrames.flatMap((frame) => frame.relatedAffordanceIds),
        ...practiceCandidates.flatMap((candidate) => candidate.relatedAffordanceIds),
      ], SAMPLE_CAP),
      knowledgeIdSamples: capStrings([
        ...problemFrames.flatMap((frame) => frame.relatedKnowledgeIds),
        ...practiceCandidates.flatMap((candidate) => candidate.relatedKnowledgeIds),
      ], SAMPLE_CAP),
      eventIdSamples: capStrings([
        ...problemFrames.flatMap((frame) => frame.relatedEventIds),
        ...practiceCandidates.flatMap((candidate) => candidate.relatedEventIds),
      ], SAMPLE_CAP),
      activityIdSamples: capStrings([
        ...problemFrames.flatMap((frame) => frame.relatedActivityIds),
        ...practiceCandidates.flatMap((candidate) => candidate.relatedActivityIds),
      ], SAMPLE_CAP),
      repetitionIdSamples: capStrings([
        ...problemFrames.flatMap((frame) => frame.relatedRepetitionIds),
        ...practiceCandidates.flatMap((candidate) => candidate.relatedRepetitionIds),
      ], SAMPLE_CAP),
      legacyStartingSkillProofCount: 0,
      fakeSkillStateCount: 0,
      decisionPathIsolation: true,
    },
  };
}

function buildFoodFrame(context: ProblemPracticeContext): ProblemFrameDraft | undefined {
  const evidence: ProblemPracticeEvidenceRef[] = [];
  addEventEvidence(context, evidence, ["food_water_pressure"], "food or water pressure is remembered");
  addKnowledgeEvidence(context, evidence, ["food_work", "risk_caution"], "food-work knowledge frames the pressure");
  addTripEvidence(context, evidence, ["plant_gathering_group", "local_foraging_group", "plant_followup_group", "hunting_group", "fishing_group"], "recent food work repeats");
  addActivitySummaryEvidence(context, evidence, "activity returns make food work visible");
  addSeasonalEvidence(context, evidence, "food stress or low return is visible", Math.max(context.band.seasonalSupport?.currentSeasonSupport.foodStress ?? 0, context.band.seasonalSupport?.currentSeasonSupport.deficitRatio ?? 0), 0.18);
  addRepetitionEvidence(context, evidence, ["food_work", "food_processing"], "repeated food work remains only familiarity");

  if (evidence.length === 0) {
    return undefined;
  }

  const highStress = (context.band.seasonalSupport?.currentSeasonSupport.foodStress ?? 0) >= 0.42 ||
    (context.band.seasonalSupport?.currentSeasonSupport.deficitRatio ?? 0) >= 0.24;
  return makeFrameDraft({
    family: "food_return_subsistence",
    publicLabel: highStress ? "Food work is not returning enough" : "Food work may be taking too much effort",
    meaning: "The band is interpreting food pressure through remembered work, returns, and nearby known places.",
    perceivedCause: highStress ? "the season or nearby food places feel poor" : "food work may need better handling or timing",
    uncertainty: "They cannot yet separate patch scarcity, season, travel cost, carrying burden, and processing difficulty.",
    possibleMisread: "A low return routine may look like a food problem even when distance, labor, or preparation is the stronger cause.",
    evidence,
    relatedAffordanceFamilies: ["food_processing", "carrying_containers_cordage", "tool_cutting_scraping_digging", "water_edge_trapping"],
    possibleExperimentHooks: ["food_processing_trial", "carrying_container_cordage", "tool_digging_cutting_trial", "water_edge_capture_trial"],
  });
}

function buildCarryingFrame(context: ProblemPracticeContext): ProblemFrameDraft | undefined {
  const evidence: ProblemPracticeEvidenceRef[] = [];
  addDemographyEvidence(context, evidence, dependencyLoad(context.band), 0.22, "dependents or elders add carrying pressure");
  addBodyCampEvidence(context, evidence, "care and travel burden make moving loads harder", bodyCampCarrySignal(context.band), 0.18);
  addTripEvidence(context, evidence, ["plant_gathering_group", "local_foraging_group", "water_group"], "food or water trips create load questions");
  addActivitySummaryEvidence(context, evidence, "activity returns create carrying and sorting questions");
  addMoveEvidence(context, evidence, "recent moves expose load and setup burden");
  addRepetitionEvidence(context, evidence, ["fiber_handling", "food_work", "material_handling"], "handling repeats without proving a method");
  addIdentityEvidence(context, evidence, ["social_demographic"], "people and labor posture make load pressure salient");

  if (evidence.length === 0) {
    return undefined;
  }

  return makeFrameDraft({
    family: "carrying_logistical_burden",
    publicLabel: "Carrying burden is shaping daily work",
    meaning: "The band may read the pressure as loads, dependents, and close-range work rather than as a resource problem alone.",
    perceivedCause: "we cannot carry enough from the known places",
    uncertainty: "The burden may come from labor, trip distance, dependents, crossing risk, or poor returns at the source.",
    possibleMisread: "They may treat this as a carrying problem even if the stronger issue is unreliable food or a hard route.",
    evidence,
    relatedAffordanceFamilies: ["carrying_containers_cordage", "camp_organization_care", "tool_cutting_scraping_digging"],
    possibleExperimentHooks: ["carrying_container_cordage", "camp_shelter_care_trial", "tool_digging_cutting_trial"],
  });
}

function buildCrossingFrame(context: ProblemPracticeContext): ProblemFrameDraft | undefined {
  const evidence: ProblemPracticeEvidenceRef[] = [];
  addCrossingEvidence(context, evidence, "known crossing has burden or risk");
  addEventEvidence(context, evidence, ["route_crossing"], "crossing event is remembered");
  addKnowledgeEvidence(context, evidence, ["crossing", "risk_caution"], "crossing knowledge carries caution");
  addMoveEvidence(context, evidence, "moves make route difficulty visible");
  addRepetitionEvidence(context, evidence, ["crossing"], "crossing repetition has not become mastery");
  addIdentityEvidence(context, evidence, ["risk_memory", "mobility_style"], "remembered movement risk is salient");

  if (evidence.length === 0) {
    return undefined;
  }

  return makeFrameDraft({
    family: "crossing_blocked_path",
    publicLabel: "A crossing or river path feels hard",
    meaning: "The band can frame movement trouble as a river or crossing problem from repeated difficulty or caution memory.",
    perceivedCause: "the river or crossing is unreliable",
    uncertainty: "The crossing may be only one visible part of a larger route, season, load, or dependent-care burden.",
    possibleMisread: "They may blame the river while the load carried across it is what makes the crossing worse.",
    evidence,
    relatedAffordanceFamilies: ["route_crossing_engineering", "carrying_containers_cordage"],
    possibleExperimentHooks: ["crossing_route_trial", "carrying_container_cordage"],
  });
}

function buildRouteFrame(context: ProblemPracticeContext): ProblemFrameDraft | undefined {
  const evidence: ProblemPracticeEvidenceRef[] = [];
  addRouteEvidence(context, evidence, "used route gives a safer-looking path");
  addEventEvidence(context, evidence, ["movement_place", "origin_lineage"], "movement or fission event changes country");
  addKnowledgeEvidence(context, evidence, ["route_corridor", "place_country", "inherited_memory"], "route or country knowledge frames uncertainty");
  addMoveEvidence(context, evidence, "recent residential move tests known country");
  addRepetitionEvidence(context, evidence, ["route_use"], "route repetition is familiarity only");
  addDaughterInheritanceEvidence(context, evidence);

  if (evidence.length === 0) {
    return undefined;
  }

  const daughter = bandHasInheritedDaughterContext(context.band);
  return makeFrameDraft({
    family: "route_new_country_uncertainty",
    publicLabel: daughter ? "Inherited route memory may not fit this country" : "Known routes feel safer than new country",
    meaning: "The band may explain uncertainty through route memory, familiar country, and what has or has not been personally tested.",
    perceivedCause: daughter ? "parent memory may not match this place" : "known routes are safer than unknown country",
    uncertainty: "A route can be familiar without being useful now, and a daughter may carry warnings it has not tested locally.",
    possibleMisread: "Old country memory can pull attention away from local evidence that has not accumulated yet.",
    evidence,
    relatedAffordanceFamilies: ["route_crossing_engineering", "camp_organization_care"],
    possibleExperimentHooks: ["crossing_route_trial", "camp_shelter_care_trial"],
  });
}

function buildCampFrame(context: ProblemPracticeContext): ProblemFrameDraft | undefined {
  const evidence: ProblemPracticeEvidenceRef[] = [];
  addPlaceEvidence(context, evidence, "repeated return makes camp setup visible");
  addMoveEvidence(context, evidence, "recent moves create post-arrival setup work");
  addDemographyEvidence(context, evidence, dependencyLoad(context.band), 0.2, "dependents or elders keep work close");
  addBodyCampEvidence(context, evidence, "camp care, material wear, or weather is visible", bodyCampCareSignal(context.band), 0.18);
  addKnowledgeEvidence(context, evidence, ["place_country", "water_refuge"], "known places and refuge memory shape camp work");
  addRepetitionEvidence(context, evidence, ["camp_setup"], "camp setup repeats without becoming a practice");

  if (evidence.length === 0) {
    return undefined;
  }

  return makeFrameDraft({
    family: "camp_setup_care_burden",
    publicLabel: "Camp and care work keeps returning",
    meaning: "The hard part may be understood as putting camp back together, keeping work close, or managing care after movement.",
    perceivedCause: "camp takes time to put back together",
    uncertainty: "This may be a real care burden, or it may be a symptom of repeated moves, poor food work, or water dependence.",
    possibleMisread: "A familiar setup routine can feel useful even when it only repeats a low-feedback habit.",
    evidence,
    relatedAffordanceFamilies: ["shelter_camp_structure", "camp_organization_care", "fire_hearth_fuel"],
    possibleExperimentHooks: ["camp_shelter_care_trial", "fire_hearth_fuel_trial"],
  });
}

function buildWaterFrame(context: ProblemPracticeContext): ProblemFrameDraft | undefined {
  const evidence: ProblemPracticeEvidenceRef[] = [];
  addSeasonalEvidence(context, evidence, "water stress or refuge pull is visible", Math.max(context.band.seasonalSupport?.currentSeasonSupport.waterStress ?? 0, (context.band.seasonalSupport?.waterStressSeasonsLast8 ?? 0) / 8), 0.16);
  addEventEvidence(context, evidence, ["food_water_pressure", "movement_place"], "water or refuge event is remembered");
  addKnowledgeEvidence(context, evidence, ["water_refuge", "place_country"], "water and refuge knowledge shapes movement");
  addTripEvidence(context, evidence, ["water_group", "fishing_group", "local_foraging_group"], "water-edge work or water trips recur");
  addPlaceEvidence(context, evidence, "known return place may be water or refuge");

  if (evidence.length === 0) {
    return undefined;
  }

  return makeFrameDraft({
    family: "water_refuge_pressure",
    publicLabel: "Safe water or refuge pulls attention back",
    meaning: "The band may frame movement and work around known water or refuge rather than hidden water quality or illness.",
    perceivedCause: "moving away from known water is risky",
    uncertainty: "The current evidence is about reliability and refuge, not waterborne illness or quality.",
    possibleMisread: "A familiar water place may look like the solution even if it keeps food work or crowding pressure high.",
    evidence,
    relatedAffordanceFamilies: ["water_edge_trapping", "fire_hearth_fuel", "camp_organization_care"],
    possibleExperimentHooks: ["water_edge_capture_trial", "fire_hearth_fuel_trial", "camp_shelter_care_trial"],
  });
}

function buildSocialFrame(context: ProblemPracticeContext): ProblemFrameDraft | undefined {
  const evidence: ProblemPracticeEvidenceRef[] = [];
  addContactEvidence(context, evidence, "known contact creates uncertainty");
  addReportedKnowledgeEvidence(context, evidence, "reports carry social or access uncertainty");
  addEventEvidence(context, evidence, ["contact_social"], "contact event is remembered");
  addKnowledgeEvidence(context, evidence, ["social_contact"], "social/contact knowledge is carried as reports");

  if (evidence.length === 0) {
    return undefined;
  }

  return makeFrameDraft({
    family: "social_contact_uncertainty",
    publicLabel: "Other bands make access uncertain",
    meaning: "Contact and reports can make the band unsure about access or shared use, without creating wider social rules.",
    perceivedCause: "other people may change whether a place is easy to use",
    uncertainty: "The evidence is contact memory and reports, not territory, law, alliance, or conflict.",
    possibleMisread: "A report can be stale, partial, or second-hand; it should not be treated as local proof.",
    evidence,
    relatedAffordanceFamilies: ["camp_organization_care", "route_crossing_engineering"],
    possibleExperimentHooks: ["camp_shelter_care_trial", "crossing_route_trial"],
  });
}

function makeFrameDraft(input: Omit<ProblemFrameDraft, "score">): ProblemFrameDraft {
  const score = scoreEvidence(input.evidence) + input.possibleExperimentHooks.length * 0.02;
  return { ...input, score };
}

function finalizeFrame(context: ProblemPracticeContext, draft: ProblemFrameDraft): ProblemFrame {
  const evidence = capEvidence(draft.evidence, EVIDENCE_PER_FRAME_CAP);
  const livedEvidenceCount = evidence.filter((entry) => entry.livedBasis === "lived" || entry.livedBasis === "mixed").length;
  const inheritedEvidenceCount = evidence.filter((entry) => entry.livedBasis === "inherited_not_lived").length;
  const relatedAffordanceIds = capStrings(context.affordances
    .filter((item) => draft.relatedAffordanceFamilies.includes(item.family))
    .map((item) => item.id), RELATED_LINK_CAP);
  const relatedKnowledgeIds = capStrings(evidence
    .map((entry) => entry.knowledgeId)
    .filter((id): id is string => id !== undefined), RELATED_LINK_CAP);
  const relatedEventIds = capStrings(evidence
    .map((entry) => entry.eventId)
    .filter((id): id is string => id !== undefined), RELATED_LINK_CAP);
  const relatedActivityIds = capStrings(evidence
    .map((entry) => entry.activityId)
    .filter((id): id is string => id !== undefined), RELATED_LINK_CAP);
  const relatedRepetitionIds = capStrings(evidence
    .map((entry) => entry.repetitionId)
    .filter((id): id is string => id !== undefined), RELATED_LINK_CAP);

  return {
    id: `problem-frame:${String(context.band.id)}:${draft.family}`,
    family: draft.family,
    publicLabel: draft.publicLabel,
    meaning: draft.meaning,
    objectiveBasis: capStrings(evidence.map((entry) => entry.label), EVIDENCE_PER_FRAME_CAP),
    perceivedCause: draft.perceivedCause,
    confidence: round2(Math.max(0.16, Math.min(0.92, draft.score))),
    uncertainty: draft.uncertainty,
    possibleMisread: draft.possibleMisread,
    evidence,
    sourceSystems: capStrings(evidence.map((entry) => entry.sourceSystem), SAMPLE_CAP) as readonly ProblemFrameSourceSystem[],
    livedBasis: deriveLivedBasis(livedEvidenceCount, inheritedEvidenceCount),
    livedEvidenceCount,
    inheritedEvidenceCount,
    relatedAffordanceIds,
    relatedKnowledgeIds,
    relatedEventIds,
    relatedActivityIds,
    relatedRepetitionIds,
    possibleExperimentHooks: draft.possibleExperimentHooks,
    noDecisionInfluence: true,
  };
}

function buildPracticeCandidates(context: ProblemPracticeContext, frames: readonly ProblemFrame[]): readonly PracticeExperimentCandidate[] {
  const candidates = CANDIDATE_SPECS
    .map((spec) => buildPracticeCandidate(context, frames, spec))
    .filter((candidate): candidate is PracticeExperimentCandidate => candidate !== undefined)
    .sort((left, right) =>
      candidateStatusRank(left.status) - candidateStatusRank(right.status) ||
      right.confidence - left.confidence ||
      candidateFamilyRank(left.family) - candidateFamilyRank(right.family));
  return candidates.slice(0, PRACTICE_CANDIDATE_CAP);
}

function buildPracticeCandidate(
  context: ProblemPracticeContext,
  frames: readonly ProblemFrame[],
  spec: CandidateSpec,
): PracticeExperimentCandidate | undefined {
  const frame = selectFrameForCandidate(frames, spec.frameFamilies);
  if (frame === undefined) {
    return undefined;
  }

  const affordances = context.affordances.filter((item) => spec.affordanceFamilies.includes(item.family));
  const primaryAffordance = selectBestAffordance(affordances);
  const evidence = capEvidence([
    ...frame.evidence,
    ...affordances.map((item) => affordanceEvidence(context, item)),
  ], EVIDENCE_PER_CANDIDATE_CAP);
  const materialBasis = capStrings(affordances.flatMap((item) => item.materialBasis), BASIS_PER_CANDIDATE_CAP);
  const knowledgeBasis = capStrings([
    ...frame.evidence.filter((entry) => entry.sourceSystem === "knowledge_ecology").map((entry) => entry.label),
    ...affordances.flatMap((item) => item.knowledgeBasis),
  ], BASIS_PER_CANDIDATE_CAP);
  const activityRepetitionBasis = capStrings([
    ...frame.evidence
      .filter((entry) =>
        entry.sourceSystem === "activity_party" ||
        entry.sourceSystem === "activity_summary" ||
        entry.sourceSystem === "residential_move" ||
        entry.sourceSystem === "foraging_adaptation")
      .map((entry) => entry.label),
    ...affordances.flatMap((item) => item.activityEventBasis),
  ], BASIS_PER_CANDIDATE_CAP);
  const relatedAffordanceIds = capStrings(affordances.map((item) => item.id), RELATED_LINK_CAP);
  const relatedKnowledgeIds = capStrings(evidence
    .map((entry) => entry.knowledgeId)
    .filter((id): id is string => id !== undefined), RELATED_LINK_CAP);
  const relatedEventIds = capStrings(evidence
    .map((entry) => entry.eventId)
    .filter((id): id is string => id !== undefined), RELATED_LINK_CAP);
  const relatedActivityIds = capStrings(evidence
    .map((entry) => entry.activityId)
    .filter((id): id is string => id !== undefined), RELATED_LINK_CAP);
  const relatedRepetitionIds = capStrings(evidence
    .map((entry) => entry.repetitionId)
    .filter((id): id is string => id !== undefined), RELATED_LINK_CAP);
  const repetition = selectCandidateRepetition(context, spec.family);
  const status = deriveCandidateStatus(context, frame, primaryAffordance, repetition, materialBasis.length);
  const feedback = deriveFeedbackType(spec, frame, repetition, status);
  const risks = deriveCandidateRisks(repetition, feedback, status, primaryAffordance);
  const confidence = candidateConfidence(frame, primaryAffordance, repetition, materialBasis.length, status);

  return {
    id: `practice-candidate:${String(context.band.id)}:${spec.family}:${frame.family}`,
    family: spec.family,
    publicLabel: spec.publicLabel,
    meaning: spec.meaning,
    problemFrameId: frame.id,
    problemFamily: frame.family,
    relatedAffordanceIds,
    relatedKnowledgeIds,
    relatedEventIds,
    relatedActivityIds,
    relatedRepetitionIds,
    materialBasis,
    knowledgeBasis,
    activityRepetitionBasis,
    expectedFeedbackType: feedback,
    likelyCostRisk: spec.likelyCostRisk,
    laborBurden: spec.family === "camp_shelter_care_trial" && dependencyLoad(context.band) >= 0.36 ? "high care and setup burden" : spec.laborBurden,
    confidence,
    uncertainty: candidateUncertainty(status, feedback, materialBasis.length, frame.livedBasis),
    deadEndRisk: risks.deadEndRisk,
    falseConfidenceRisk: risks.falseConfidenceRisk,
    lowFeedbackRisk: risks.lowFeedbackRisk,
    localOnlyRisk: risks.localOnlyRisk,
    status,
    evidence,
    noSkillUnlocked: true,
    noAutomaticImprovement: true,
    futureHook: "practice_learning_candidate",
  };
}

function selectFrameForCandidate(
  frames: readonly ProblemFrame[],
  families: readonly ProblemFrameFamily[],
): ProblemFrame | undefined {
  return [...frames]
    .filter((frame) => families.includes(frame.family))
    .sort((left, right) => right.confidence - left.confidence || problemFamilyRank(left.family) - problemFamilyRank(right.family))[0];
}

function selectBestAffordance(items: readonly MaterialAffordanceItem[]): MaterialAffordanceItem | undefined {
  return [...items].sort((left, right) =>
    materialStatusRank(right.status) - materialStatusRank(left.status) ||
    right.confidence - left.confidence ||
    left.family.localeCompare(right.family))[0];
}

function deriveCandidateStatus(
  context: ProblemPracticeContext,
  frame: ProblemFrame,
  affordance: MaterialAffordanceItem | undefined,
  repetition: RepetitionAffordanceItem | undefined,
  materialBasisCount: number,
): PracticeExperimentStatus {
  if (frame.livedBasis === "inherited_not_lived") {
    return "inherited_not_tested_here";
  }
  if (repetition?.deadEndRisk === "false_confidence_risk") {
    return "false_confidence_risk";
  }
  if (repetition?.deadEndRisk === "dead_end_attempt" || repetition?.deadEndRisk === "reinforced_bad_habit") {
    return "dead_end_risk";
  }
  if (repetition?.deadEndRisk === "local_context_only") {
    return "local_only";
  }
  if (repetition?.feedbackQuality === "low_feedback" || repetition?.deadEndRisk === "low_feedback_risk") {
    return "low_feedback_repetition";
  }
  if (affordance === undefined || affordance.status === "unsupported_by_current_data" || affordance.status === "absent") {
    return materialBasisCount === 0 ? "currently_unsupported" : "uncertain";
  }
  if ((affordance.status === "blocked_constrained" || materialBasisCount === 0) && frame.relatedAffordanceIds.length > 0) {
    return "blocked_by_missing_material";
  }
  if (dependencyLoad(context.band) >= 0.5 && context.band.demography.workingAdults < context.band.demography.dependents) {
    return "blocked_by_labor";
  }
  if (repetition !== undefined && repetition.repeatedExposureCount > 0) {
    return "implicit_repetition";
  }
  if (affordance.status === "future_only") {
    return "inherited_not_tested_here";
  }
  return "plausible_untried";
}

function deriveFeedbackType(
  spec: CandidateSpec,
  frame: ProblemFrame,
  repetition: RepetitionAffordanceItem | undefined,
  status: PracticeExperimentStatus,
): PracticeFeedbackType {
  if (status === "inherited_not_tested_here") {
    return "inherited_no_local_feedback";
  }
  if (status === "dead_end_risk" || status === "false_confidence_risk") {
    return "contradicted_by_recent_events";
  }
  if (frame.family === "crossing_blocked_path") {
    return repetition?.feedbackQuality === "negative_feedback" ? "dangerous_feedback" : "mixed_feedback";
  }
  if (repetition !== undefined) {
    switch (repetition.feedbackQuality) {
      case "low_feedback":
        return "low_feedback";
      case "mixed_feedback":
        return "mixed_feedback";
      case "useful_feedback":
        return "clear_success";
      case "negative_feedback":
        return "clear_failure";
      case "context_bound_feedback":
        return "local_only_success";
    }
  }
  return spec.fallbackFeedback;
}

function deriveCandidateRisks(
  repetition: RepetitionAffordanceItem | undefined,
  feedback: PracticeFeedbackType,
  status: PracticeExperimentStatus,
  affordance: MaterialAffordanceItem | undefined,
): {
  readonly deadEndRisk: PracticeRiskLevel;
  readonly falseConfidenceRisk: PracticeRiskLevel;
  readonly lowFeedbackRisk: PracticeRiskLevel;
  readonly localOnlyRisk: PracticeRiskLevel;
} {
  const constrained = affordance?.status === "blocked_constrained" || affordance?.status === "weak";
  return {
    deadEndRisk: status === "dead_end_risk" || repetition?.deadEndRisk === "dead_end_attempt" || repetition?.deadEndRisk === "reinforced_bad_habit"
      ? "high"
      : constrained ? "present" : "low",
    falseConfidenceRisk: status === "false_confidence_risk" || repetition?.deadEndRisk === "false_confidence_risk"
      ? "high"
      : feedback === "local_only_success" ? "present" : "low",
    lowFeedbackRisk: status === "low_feedback_repetition" || feedback === "low_feedback" ? "high" : feedback === "delayed_feedback" ? "present" : "low",
    localOnlyRisk: status === "local_only" || repetition?.deadEndRisk === "local_context_only" || feedback === "local_only_success" ? "high" : "low",
  };
}

function candidateConfidence(
  frame: ProblemFrame,
  affordance: MaterialAffordanceItem | undefined,
  repetition: RepetitionAffordanceItem | undefined,
  materialBasisCount: number,
  status: PracticeExperimentStatus,
): NormalizedIntensity {
  const affordanceScore = affordance === undefined ? 0.08 : affordance.confidence * 0.38 + materialStatusRank(affordance.status) * 0.035;
  const repetitionScore = repetition === undefined ? 0 : Math.min(0.2, (repetition.repeatedExposureCount + repetition.repeatedAttemptSignal) / 60);
  const materialScore = Math.min(0.12, materialBasisCount * 0.04);
  const statusDrag = status === "currently_unsupported" || status === "blocked_by_missing_material"
    ? 0.18
    : status === "inherited_not_tested_here"
      ? 0.12
      : 0;
  return round2(frame.confidence * 0.34 + affordanceScore + repetitionScore + materialScore - statusDrag);
}

function candidateUncertainty(
  status: PracticeExperimentStatus,
  feedback: PracticeFeedbackType,
  materialBasisCount: number,
  livedBasis: ProblemFrameLivedBasis,
): string {
  if (status === "inherited_not_tested_here" || livedBasis === "inherited_not_lived") {
    return "Carried from older or parent memory; not locally tested by this band.";
  }
  if (status === "currently_unsupported" || status === "blocked_by_missing_material" || materialBasisCount === 0) {
    return "The problem is visible, but the material basis for this trial is still weak.";
  }
  if (feedback === "low_feedback" || status === "low_feedback_repetition") {
    return "Repeating the routine may produce familiarity without showing whether it works.";
  }
  if (feedback === "dangerous_feedback" || feedback === "contradicted_by_recent_events") {
    return "Feedback may be clear only when the attempt fails or becomes dangerous.";
  }
  if (feedback === "local_only_success") {
    return "Success here may not travel well to other places or seasons.";
  }
  return "Plausible as a trial, but it has not become a reliable method.";
}

function selectCandidateRepetition(
  context: ProblemPracticeContext,
  family: PracticeExperimentFamily,
): RepetitionAffordanceItem | undefined {
  const domains = repetitionDomainsForCandidate(family);
  return context.repetitions.find((entry) => domains.includes(entry.domain));
}

function repetitionDomainsForCandidate(family: PracticeExperimentFamily): readonly RepetitionAffordanceItem["domain"][] {
  switch (family) {
    case "carrying_container_cordage":
      return ["fiber_handling", "material_handling", "food_work"];
    case "food_processing_trial":
      return ["food_processing", "food_work"];
    case "crossing_route_trial":
      return ["crossing", "route_use"];
    case "camp_shelter_care_trial":
      return ["camp_setup", "material_handling"];
    case "fire_hearth_fuel_trial":
      return ["camp_setup", "food_processing"];
    case "water_edge_capture_trial":
      return ["food_work", "crossing"];
    case "tool_digging_cutting_trial":
      return ["material_handling", "food_work", "food_processing"];
  }
}

function affordanceEvidence(context: ProblemPracticeContext, item: MaterialAffordanceItem): ProblemPracticeEvidenceRef {
  return {
    kind: "affordance",
    sourceSystem: "material_affordance",
    label: item.publicLabel,
    sourceId: item.id,
    confidence: item.confidence,
    livedBasis: item.livedBasis,
    affordanceId: item.id,
    reasonIds: item.evidence.flatMap((entry) => entry.reasonIds).slice(0, 3),
    tileId: item.evidence.find((entry) => entry.tileId !== undefined)?.tileId,
    routeId: item.evidence.find((entry) => entry.routeId !== undefined)?.routeId,
  };
}

function addEventEvidence(
  context: ProblemPracticeContext,
  evidence: ProblemPracticeEvidenceRef[],
  families: readonly CanonicalEvent["family"][],
  label: string,
): void {
  const event = context.events.find((entry) => families.includes(entry.family));
  if (event === undefined) {
    return;
  }
  evidence.push({
    kind: "event",
    sourceSystem: "canonical_event",
    label,
    sourceId: event.id,
    confidence: round2(Math.max(0.2, event.significance)),
    livedBasis: event.livedStatus === "inherited_not_personally_lived" ? "inherited_not_lived" : "lived",
    eventId: event.id,
    tileId: event.involvedTileIds[0],
    routeId: event.involvedRouteIds[0],
    reasonIds: event.sourceReasonIds.slice(0, 3),
  });
}

function addKnowledgeEvidence(
  context: ProblemPracticeContext,
  evidence: ProblemPracticeEvidenceRef[],
  domains: readonly KnowledgeEcologyItem["domain"][],
  label: string,
): void {
  const item = context.knowledgeItems.find((entry) => domains.includes(entry.domain));
  if (item === undefined) {
    return;
  }
  evidence.push({
    kind: "knowledge",
    sourceSystem: "knowledge_ecology",
    label,
    sourceId: item.id,
    confidence: round2(item.confidence),
    livedBasis: item.livedStatus === "inherited_not_personally_lived" ? "inherited_not_lived" : "lived",
    knowledgeId: item.id,
    tileId: item.involvedTileIds[0],
    routeId: item.involvedRouteIds[0],
    reasonIds: item.evidence.flatMap((entry) => entry.reasonIds).slice(0, 3),
  });
}

function addTripEvidence(
  context: ProblemPracticeContext,
  evidence: ProblemPracticeEvidenceRef[],
  taskTypes: readonly IntraSeasonTripTaskGroupType[],
  label: string,
): void {
  const trip = context.trips.find((entry) => taskTypes.includes(entry.taskGroupType));
  if (trip === undefined) {
    return;
  }
  const activityId = `${String(trip.sourceBandId)}:${Number(trip.tick)}:${trip.taskGroupType}:${String(trip.targetTileId)}`;
  evidence.push({
    kind: "activity",
    sourceSystem: "activity_party",
    label,
    sourceId: activityId,
    confidence: activityConfidence(trip),
    livedBasis: "lived",
    activityId,
    tileId: trip.targetTileId,
    reasonIds: trip.reasonIds.slice(0, 3),
  });
}

function addActivitySummaryEvidence(
  context: ProblemPracticeContext,
  evidence: ProblemPracticeEvidenceRef[],
  label: string,
): void {
  const summary = context.band.activityOutcomeSummary;
  if (summary !== undefined) {
    const signal = summary.successCount + summary.partialCount + summary.failedCount + summary.informationCount +
      summary.returnsByResourceKind.reduce((sum, entry) => sum + entry.count, 0);
    if (signal <= 0) {
      return;
    }
    const activityId = `${String(summary.bandId)}:${Number(summary.tick)}:${String(summary.day)}:activity-summary`;
    evidence.push({
      kind: "activity",
      sourceSystem: "activity_summary",
      label,
      sourceId: activityId,
      confidence: round2(Math.min(0.86, signal / 14 + summary.maxEstimatedReturnValue * 0.25)),
      livedBasis: "lived",
      activityId,
      reasonIds: [`reason:problem-practice:${String(context.band.id)}:${Number(summary.tick)}:activity-summary` as ReasonId],
    });
    return;
  }

  const labor = context.band.activityLaborSummary;
  if (labor === undefined || labor.activeActivityGroupCount <= 0) {
    return;
  }
  const activityId = `${String(labor.bandId)}:${Number(labor.tick)}:${String(labor.day)}:activity-labor-summary`;
  evidence.push({
    kind: "activity",
    sourceSystem: "activity_summary",
    label,
    sourceId: activityId,
    confidence: round2(Math.min(0.78, labor.activeActivityGroupCount / 8 + labor.peopleAssignedToActivityGroups / Math.max(1, labor.workingAdults) * 0.22)),
    livedBasis: "lived",
    activityId,
    tileId: labor.latestActivityGroupSummary?.targetTileId,
    reasonIds: labor.latestActivityGroupSummary?.sourceTripReasonIds.slice(0, 3) ?? [`reason:problem-practice:${String(context.band.id)}:${Number(labor.tick)}:activity-labor-summary` as ReasonId],
  });
}

function addPlaceEvidence(context: ProblemPracticeContext, evidence: ProblemPracticeEvidenceRef[], label: string): void {
  const place = context.places.find((entry) => entry.repeatedReturnCount >= 2 || entry.visitCount >= 4 || entry.attachment >= 0.3);
  if (place === undefined) {
    return;
  }
  evidence.push({
    kind: "memory",
    sourceSystem: "place_memory",
    label,
    sourceId: String(place.tileId),
    confidence: round2(Math.max(place.confidence, Math.min(0.88, Math.max(place.repeatedReturnCount, place.visitCount) / 10), place.attachment)),
    livedBasis: "lived",
    tileId: place.tileId,
    reasonIds: place.reasonIds.slice(0, 3),
  });
}

function addRouteEvidence(context: ProblemPracticeContext, evidence: ProblemPracticeEvidenceRef[], label: string): void {
  const route = context.routes[0];
  if (route === undefined) {
    return;
  }
  evidence.push({
    kind: "memory",
    sourceSystem: "route_memory",
    label,
    sourceId: String(route.id),
    confidence: round2(Math.max(route.confidence, Math.min(0.88, route.useCount / 8))),
    livedBasis: "lived",
    tileId: route.toTileId,
    routeId: route.id,
    reasonIds: [`reason:problem-practice:${String(context.band.id)}:${String(route.id)}:route-memory` as ReasonId],
  });
}

function addCrossingEvidence(context: ProblemPracticeContext, evidence: ProblemPracticeEvidenceRef[], label: string): void {
  const crossing = context.crossings[0];
  if (crossing === undefined) {
    return;
  }
  evidence.push({
    kind: "memory",
    sourceSystem: "crossing_memory",
    label,
    sourceId: `${String(crossing.crossingTileA)}:${String(crossing.crossingTileB)}`,
    confidence: round2(Math.max(crossing.riskMemory, crossing.successConfidence, Math.min(0.88, crossing.useCount / 8))),
    livedBasis: "lived",
    tileId: crossing.crossingTileA,
    reasonIds: crossing.reasonIds.slice(0, 3),
  });
}

function addMoveEvidence(context: ProblemPracticeContext, evidence: ProblemPracticeEvidenceRef[], label: string): void {
  const move = context.moves[0];
  if (move === undefined) {
    return;
  }
  evidence.push({
    kind: "activity",
    sourceSystem: "residential_move",
    label,
    sourceId: String(move.eventId),
    confidence: round2(move.confidence),
    livedBasis: "lived",
    activityId: String(move.eventId),
    tileId: move.toTileId,
    reasonIds: move.reasonIds.slice(0, 3),
  });
}

function addDemographyEvidence(
  context: ProblemPracticeContext,
  evidence: ProblemPracticeEvidenceRef[],
  value: number,
  threshold: number,
  label: string,
): void {
  if (value < threshold) {
    return;
  }
  evidence.push({
    kind: "demography",
    sourceSystem: "demography",
    label,
    sourceId: `demography:${String(context.band.id)}`,
    confidence: round2(value),
    livedBasis: "lived",
    reasonIds: context.band.demography.lastPopulationChangeReasonIds.slice(0, 3),
  });
}

function addSeasonalEvidence(
  context: ProblemPracticeContext,
  evidence: ProblemPracticeEvidenceRef[],
  label: string,
  signal: number,
  threshold: number,
): void {
  const support = context.band.seasonalSupport;
  if (support === undefined || signal < threshold) {
    return;
  }
  evidence.push({
    kind: "seasonal_support",
    sourceSystem: "seasonal_support",
    label,
    sourceId: `seasonal-support:${String(context.band.id)}:${Number(support.lastUpdatedTick)}`,
    confidence: round2(signal),
    livedBasis: "lived",
    reasonIds: support.reasonIds.slice(0, 3),
  });
}

function addBodyCampEvidence(
  context: ProblemPracticeContext,
  evidence: ProblemPracticeEvidenceRef[],
  label: string,
  signal: number,
  threshold: number,
): void {
  const logistics = context.band.bodyCampLogistics;
  if (logistics === undefined || signal < threshold) {
    return;
  }
  evidence.push({
    kind: "memory",
    sourceSystem: "body_camp_logistics",
    label,
    sourceId: `body-camp-logistics:${String(context.band.id)}:${Number(logistics.lastUpdatedTick)}`,
    confidence: round2(signal),
    livedBasis: "lived",
    reasonIds: logistics.reasonIds.slice(0, 3),
  });
}

function addRepetitionEvidence(
  context: ProblemPracticeContext,
  evidence: ProblemPracticeEvidenceRef[],
  domains: readonly RepetitionAffordanceItem["domain"][],
  label: string,
): void {
  const repetition = context.repetitions.find((entry) => domains.includes(entry.domain));
  if (repetition === undefined) {
    return;
  }
  evidence.push({
    kind: "repetition",
    sourceSystem: "foraging_adaptation",
    label,
    sourceId: repetition.id,
    confidence: round2(Math.min(0.82, (repetition.repeatedExposureCount + repetition.repeatedAttemptSignal) / 18)),
    livedBasis: "lived",
    repetitionId: repetition.id,
    reasonIds: repetition.reasonIds.slice(0, 3),
  });
}

function addIdentityEvidence(
  context: ProblemPracticeContext,
  evidence: ProblemPracticeEvidenceRef[],
  dimensions: readonly BandIdentityCard["dimension"][],
  label: string,
): void {
  const card = context.identityCards.find((entry) => dimensions.includes(entry.dimension) && entry.evidence.length > 0);
  if (card === undefined) {
    return;
  }
  evidence.push({
    kind: "identity",
    sourceSystem: "band_identity",
    label,
    sourceId: card.id,
    confidence: round2(card.confidence),
    livedBasis: card.inheritedEvidenceCount > 0 && card.livedEvidenceCount === 0 ? "inherited_not_lived" : card.inheritedEvidenceCount > 0 ? "mixed" : "lived",
    eventId: card.relatedEventIds[0],
    reasonIds: card.evidence.flatMap((entry) => entry.reasonIds).slice(0, 3),
  });
}

function addDaughterInheritanceEvidence(context: ProblemPracticeContext, evidence: ProblemPracticeEvidenceRef[]): void {
  if (!bandHasInheritedDaughterContext(context.band)) {
    return;
  }
  const profile = context.band.inheritanceProfile;
  evidence.push({
    kind: "memory",
    sourceSystem: "demography",
    label: profile === undefined
      ? "daughter band carries parent-linked memory"
      : "daughter band has inherited memory but limited local testing",
    sourceId: `inheritance:${String(context.band.id)}:${String(context.band.parentBandId ?? "founding")}`,
    confidence: round2(Math.max(0.32, profile === undefined ? 0.34 : profile.inheritedKnowledgeShare)),
    livedBasis: "inherited_not_lived",
    reasonIds: context.band.fissionEvents[0]?.splitReason.id === undefined
      ? []
      : [context.band.fissionEvents[0].splitReason.id],
  });
}

function bandHasInheritedDaughterContext(band: Band): boolean {
  return band.parentBandId !== undefined || band.inheritanceProfile !== undefined;
}

function addContactEvidence(context: ProblemPracticeContext, evidence: ProblemPracticeEvidenceRef[], label: string): void {
  const contact = context.contacts.find((entry) => entry.contactCount > 0 || entry.sharedUseCount > 0 || entry.tension > 0.2);
  if (contact === undefined) {
    return;
  }
  evidence.push({
    kind: "contact",
    sourceSystem: "contact_memory",
    label,
    sourceId: String(contact.otherBandId),
    confidence: round2(Math.max(contact.familiarity, contact.tension, Math.min(0.86, contact.contactCount / 8))),
    livedBasis: "lived",
    reasonIds: contact.reasonIds.slice(0, 3),
  });
}

function addReportedKnowledgeEvidence(context: ProblemPracticeContext, evidence: ProblemPracticeEvidenceRef[], label: string): void {
  const reported = context.band.reportedKnowledge;
  if (reported === undefined || reported.reports.length + (reported.speculations?.length ?? 0) <= 0) {
    return;
  }
  evidence.push({
    kind: "contact",
    sourceSystem: "reported_knowledge",
    label,
    sourceId: `reported-knowledge:${String(context.band.id)}:${Number(reported.lastUpdatedTick)}`,
    confidence: round2(Math.min(0.78, (reported.reports.length + (reported.speculations?.length ?? 0)) / 10)),
    livedBasis: reported.receivedCount > (reported.internalGeneratedCount ?? 0) ? "inherited_not_lived" : "lived",
    reasonIds: [],
  });
}

function capFrameDrafts(drafts: readonly ProblemFrameDraft[]): readonly ProblemFrameDraft[] {
  return [...drafts]
    .sort((left, right) =>
      problemFamilyRank(left.family) - problemFamilyRank(right.family) ||
      right.score - left.score)
    .slice(0, PROBLEM_FRAME_CAP)
    .sort((left, right) => problemFamilyRank(left.family) - problemFamilyRank(right.family));
}

function capEvidence(evidence: readonly ProblemPracticeEvidenceRef[], cap: number): readonly ProblemPracticeEvidenceRef[] {
  const seen = new Set<string>();
  const result: ProblemPracticeEvidenceRef[] = [];
  const sorted = [...evidence].sort(compareEvidence);
  const inherited = sorted.find((entry) => entry.livedBasis === "inherited_not_lived");
  const ordered = inherited === undefined
    ? sorted
    : [inherited, ...sorted.filter((entry) => entry !== inherited)];

  for (const entry of ordered) {
    const key = `${entry.kind}:${entry.sourceSystem}:${entry.sourceId}:${entry.label}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push({ ...entry, reasonIds: entry.reasonIds.slice(0, 1) });
    if (result.length >= cap) {
      break;
    }
  }
  return result;
}

function compareEvidence(left: ProblemPracticeEvidenceRef, right: ProblemPracticeEvidenceRef): number {
  return (
    evidenceKindRank(left.kind) - evidenceKindRank(right.kind) ||
    right.confidence - left.confidence ||
    left.label.localeCompare(right.label) ||
    left.sourceId.localeCompare(right.sourceId)
  );
}

function evidenceKindRank(kind: ProblemFrameEvidenceKind): number {
  switch (kind) {
    case "event":
      return 1;
    case "knowledge":
      return 2;
    case "activity":
      return 3;
    case "memory":
      return 4;
    case "repetition":
      return 4;
    case "affordance":
      return 5;
    case "demography":
      return 7;
    case "seasonal_support":
      return 8;
    case "identity":
      return 9;
    case "contact":
      return 10;
  }
}

function scoreEvidence(evidence: readonly ProblemPracticeEvidenceRef[]): number {
  return clamp01(evidence.reduce((sum, entry) => sum + evidenceWeight(entry.kind) * entry.confidence, 0));
}

function evidenceWeight(kind: ProblemFrameEvidenceKind): number {
  switch (kind) {
    case "event":
      return 0.24;
    case "knowledge":
      return 0.2;
    case "activity":
      return 0.18;
    case "memory":
      return 0.18;
    case "repetition":
      return 0.16;
    case "demography":
      return 0.14;
    case "seasonal_support":
      return 0.14;
    case "identity":
      return 0.1;
    case "contact":
      return 0.12;
    case "affordance":
      return 0.1;
  }
}

function activityConfidence(trip: IntraSeasonTripRecord): NormalizedIntensity {
  switch (trip.activityResult) {
    case "successful_observation":
    case "target_found":
    case "returned_with_information":
      return 0.72;
    case "partial_success":
      return 0.58;
    case "target_not_found":
    case "failed_due_to_low_memory_confidence":
    case "failed_due_to_season_mismatch":
    case "no_effect_observed":
      return 0.42;
    case "failed_due_to_distance":
    case "failed_due_to_water_risk":
    case "delayed_return":
    case "abandoned_due_to_risk":
      return 0.38;
  }
}

function dependencyLoad(band: Band): number {
  return clamp01((band.demography.dependents + band.demography.elders) / Math.max(1, band.demography.population));
}

function bodyCampCarrySignal(band: Band): number {
  const burden = band.bodyCampLogistics?.careTravelBurden;
  if (burden === undefined) {
    return 0;
  }
  return Math.max(
    burden.dependentCarryBurden,
    burden.elderTravelCaution,
    burden.pregnancyNursingBurden,
    burden.sickCareBurden,
    burden.wholeBandCrossingBurden,
    burden.longMoveBurden,
    1 - burden.adultLaborAvailable,
  );
}

function bodyCampCareSignal(band: Band): number {
  const logistics = band.bodyCampLogistics;
  if (logistics === undefined) {
    return 0;
  }
  return Math.max(
    bodyCampCarrySignal(band),
    logistics.campCleanliness.pressure,
    logistics.sharingPressure.pressure,
    logistics.fire.laborCost,
    Math.min(0.78, (logistics.weatherMemories.length + logistics.materialWear.length + logistics.seasonalTasks.length) / 8),
  );
}

function comparePlaceMemory(left: PlaceMemoryRecord, right: PlaceMemoryRecord): number {
  return (
    Math.max(right.repeatedReturnCount, right.visitCount) - Math.max(left.repeatedReturnCount, left.visitCount) ||
    right.confidence - left.confidence ||
    String(left.tileId).localeCompare(String(right.tileId))
  );
}

function compareRouteMemory(left: TravelCorridorMemory, right: TravelCorridorMemory): number {
  return (
    right.useCount - left.useCount ||
    right.confidence - left.confidence ||
    String(left.id).localeCompare(String(right.id))
  );
}

function compareCrossingMemory(left: KnownCrossingMemory, right: KnownCrossingMemory): number {
  return (
    right.useCount - left.useCount ||
    right.riskMemory - left.riskMemory ||
    String(left.crossingTileA).localeCompare(String(right.crossingTileA))
  );
}

function compareRepetitionAffordance(left: RepetitionAffordanceItem, right: RepetitionAffordanceItem): number {
  return (
    right.repeatedExposureCount + right.repeatedAttemptSignal - (left.repeatedExposureCount + left.repeatedAttemptSignal) ||
    left.domain.localeCompare(right.domain) ||
    left.id.localeCompare(right.id)
  );
}

function compareContactMemory(left: KnownBandContactMemory, right: KnownBandContactMemory): number {
  return (
    right.contactCount + right.sharedUseCount - (left.contactCount + left.sharedUseCount) ||
    right.tension - left.tension ||
    String(left.otherBandId).localeCompare(String(right.otherBandId))
  );
}

function collectConstraints(
  context: ProblemPracticeContext,
  frames: readonly ProblemFrame[],
  candidates: readonly PracticeExperimentCandidate[],
): readonly string[] {
  return capStrings([
    ...candidates
      .filter((candidate) => candidate.status === "blocked_by_missing_material" || candidate.status === "currently_unsupported")
      .map((candidate) => `${candidateFamilyLabel(candidate.family)} material basis weak`),
    ...candidates
      .filter((candidate) => candidate.status === "blocked_by_labor")
      .map((candidate) => `${candidateFamilyLabel(candidate.family)} labor burden high`),
    ...frames
      .filter((frame) => frame.livedBasis === "inherited_not_lived")
      .map((frame) => `${problemFrameFamilyLabel(frame.family)} inherited only`),
    ...(context.band.parentBandId === undefined ? [] : ["daughter memory is separated from local testing"]),
  ], SAMPLE_CAP);
}

function buildOverviewTitle(frames: readonly ProblemFrame[], candidates: readonly PracticeExperimentCandidate[]): string {
  if (frames.length === 0) {
    return "No bounded problem frame is visible yet.";
  }
  if (candidates.some((candidate) => candidate.status === "dead_end_risk" || candidate.status === "false_confidence_risk" || candidate.status === "low_feedback_repetition")) {
    return "Problems are visible, but some repeated trials may mislead them.";
  }
  if (candidates.length > 0) {
    return "The band can frame a few pressures and possible trials.";
  }
  return "The hard part is visible, but trial candidates are still thin.";
}

function buildOverviewLines(frames: readonly ProblemFrame[], candidates: readonly PracticeExperimentCandidate[]): readonly string[] {
  const strongestFrames = [...frames].sort((left, right) => right.confidence - left.confidence).slice(0, 2);
  const strongestCandidates = [...candidates].sort((left, right) => right.confidence - left.confidence).slice(0, 1);
  return [
    ...strongestFrames.map((frame) => `${frame.publicLabel}: they may see it as ${frame.perceivedCause}.`),
    ...strongestCandidates.map((candidate) => `${candidate.publicLabel}: ${practiceExperimentStatusLabel(candidate.status)}, not a skill.`),
  ].slice(0, 3);
}

function countProblemFamilies(frames: readonly ProblemFrame[]): Readonly<Record<ProblemFrameFamily, number>> {
  const counts = { ...EMPTY_PROBLEM_FAMILY_COUNTS };
  for (const frame of frames) {
    counts[frame.family] += 1;
  }
  return counts;
}

function countCandidateFamilies(candidates: readonly PracticeExperimentCandidate[]): Readonly<Record<PracticeExperimentFamily, number>> {
  const counts = { ...EMPTY_CANDIDATE_FAMILY_COUNTS };
  for (const candidate of candidates) {
    counts[candidate.family] += 1;
  }
  return counts;
}

function countSourceSystems(evidence: readonly ProblemPracticeEvidenceRef[]): Readonly<Record<ProblemFrameSourceSystem, number>> {
  const counts = { ...EMPTY_SOURCE_COUNTS };
  for (const entry of evidence) {
    counts[entry.sourceSystem] += 1;
  }
  return counts;
}

function countFeedbackTypes(candidates: readonly PracticeExperimentCandidate[]): Readonly<Record<PracticeFeedbackType, number>> {
  const counts = { ...EMPTY_FEEDBACK_COUNTS };
  for (const candidate of candidates) {
    counts[candidate.expectedFeedbackType] += 1;
  }
  return counts;
}

function countStatuses(candidates: readonly PracticeExperimentCandidate[]): Readonly<Record<PracticeExperimentStatus, number>> {
  const counts = { ...EMPTY_STATUS_COUNTS };
  for (const candidate of candidates) {
    counts[candidate.status] += 1;
  }
  return counts;
}

function countStrings(values: readonly string[]): Readonly<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const value of values) {
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

function countUnique(values: readonly string[]): number {
  return new Set(values).size;
}

function capStrings<T extends string>(values: readonly T[], cap: number): readonly T[] {
  const seen = new Set<T>();
  const result: T[] = [];
  for (const value of values) {
    if (value.length === 0 || seen.has(value)) {
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

function deriveLivedBasis(livedEvidenceCount: number, inheritedEvidenceCount: number): ProblemFrameLivedBasis {
  if (livedEvidenceCount > 0 && inheritedEvidenceCount > 0) {
    return "mixed";
  }
  if (inheritedEvidenceCount > 0) {
    return "inherited_not_lived";
  }
  if (livedEvidenceCount > 0) {
    return "lived";
  }
  return "unknown";
}

function materialStatusRank(status: MaterialAffordanceStatus): number {
  switch (status) {
    case "strong":
      return 7;
    case "plausible":
      return 6;
    case "weak":
      return 5;
    case "blocked_constrained":
      return 4;
    case "future_only":
      return 3;
    case "absent":
      return 2;
    case "unsupported_by_current_data":
      return 1;
  }
}

function candidateStatusRank(status: PracticeExperimentStatus): number {
  switch (status) {
    case "plausible_untried":
      return 1;
    case "implicit_repetition":
      return 2;
    case "low_feedback_repetition":
      return 3;
    case "dead_end_risk":
      return 4;
    case "false_confidence_risk":
      return 5;
    case "local_only":
      return 6;
    case "blocked_by_labor":
      return 7;
    case "blocked_by_missing_material":
      return 8;
    case "inherited_not_tested_here":
      return 9;
    case "uncertain":
      return 10;
    case "currently_unsupported":
      return 11;
  }
}

function problemFamilyRank(family: ProblemFrameFamily): number {
  return PROBLEM_FAMILY_ORDER.indexOf(family);
}

function candidateFamilyRank(family: PracticeExperimentFamily): number {
  return CANDIDATE_FAMILY_ORDER.indexOf(family);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function round2(value: number): NormalizedIntensity {
  return Math.round(clamp01(value) * 100) / 100;
}

function byteLengthUtf8(value: string): number {
  return new TextEncoder().encode(value).length;
}

export function problemFrameFamilyLabel(family: ProblemFrameFamily): string {
  switch (family) {
    case "food_return_subsistence":
      return "Food return";
    case "carrying_logistical_burden":
      return "Carrying burden";
    case "crossing_blocked_path":
      return "Crossing";
    case "route_new_country_uncertainty":
      return "Routes and new country";
    case "camp_setup_care_burden":
      return "Camp and care";
    case "water_refuge_pressure":
      return "Water and refuge";
    case "social_contact_uncertainty":
      return "Contact uncertainty";
  }
}

export function candidateFamilyLabel(family: PracticeExperimentFamily): string {
  switch (family) {
    case "carrying_container_cordage":
      return "Carrying / containers";
    case "food_processing_trial":
      return "Food preparation";
    case "crossing_route_trial":
      return "Crossing / route";
    case "camp_shelter_care_trial":
      return "Camp / care";
    case "fire_hearth_fuel_trial":
      return "Fire / fuel";
    case "water_edge_capture_trial":
      return "Water edge";
    case "tool_digging_cutting_trial":
      return "Tools / digging";
  }
}

export function practiceExperimentStatusLabel(status: PracticeExperimentStatus): string {
  switch (status) {
    case "plausible_untried":
      return "plausible but untried";
    case "implicit_repetition":
      return "repeating implicitly";
    case "low_feedback_repetition":
      return "low-feedback repetition";
    case "blocked_by_missing_material":
      return "material basis weak";
    case "blocked_by_labor":
      return "labor constrained";
    case "inherited_not_tested_here":
      return "inherited, not tested here";
    case "currently_unsupported":
      return "unsupported for now";
    case "dead_end_risk":
      return "dead-end risk";
    case "false_confidence_risk":
      return "false-confidence risk";
    case "local_only":
      return "local only";
    case "uncertain":
      return "uncertain";
  }
}

export function practiceFeedbackTypeLabel(feedback: PracticeFeedbackType): string {
  switch (feedback) {
    case "clear_success":
      return "clear success";
    case "clear_failure":
      return "clear failure";
    case "mixed_feedback":
      return "mixed feedback";
    case "low_feedback":
      return "low feedback";
    case "delayed_feedback":
      return "delayed feedback";
    case "dangerous_feedback":
      return "dangerous feedback";
    case "local_only_success":
      return "local-only feedback";
    case "inherited_no_local_feedback":
      return "inherited, no local feedback";
    case "contradicted_by_recent_events":
      return "contradicted by recent events";
  }
}
