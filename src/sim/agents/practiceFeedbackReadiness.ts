import type { BandId, ReasonId, TileId } from "../core/types";
import type { NormalizedIntensity } from "../rules/types";
import type { WorldState } from "../world/types";
import { deriveBandIdentityProfile } from "./bandIdentity";
import { deriveCampFootholdProfile, type CampFootholdFactor, type CampFootholdProfile } from "./campFoothold";
import { deriveCanonicalEvents } from "./eventSystem";
import { deriveKnowledgeEcologyProfile } from "./knowledgeEcology";
import {
  deriveMaterialAffordanceProfile,
  type MaterialAffordanceFamily,
  type MaterialAffordanceItem,
} from "./materialAffordance";
import {
  deriveProblemPracticeProfile,
  type PracticeExperimentCandidate,
  type PracticeExperimentFamily,
  type PracticeFeedbackType,
  type ProblemFrame,
} from "./problemPractice";
import type {
  Band,
  IntraSeasonTripRecord,
  RepetitionAffordanceDomain,
  RepetitionAffordanceItem,
} from "./types";

const READINESS_ITEM_CAP = 8;
const ITEMS_PER_FAMILY_CAP = 2;
const EVIDENCE_PER_ITEM_CAP = 4;
const BLOCKERS_PER_ITEM_CAP = 4;
const RISKS_PER_ITEM_CAP = 4;
const BASIS_PER_ITEM_CAP = 4;
const LINK_PER_ITEM_CAP = 4;
const CONTEXT_RECORD_CAP = 16;
const SAMPLE_CAP = 12;

export type PracticeFeedbackReadinessFamily =
  | "carrying_fiber_handling"
  | "food_work_processing"
  | "route_crossing"
  | "camp_setup_care"
  | "fire_hearth_fuel"
  | "water_edge_capture"
  | "tool_digging_cutting";

export type PracticeFeedbackReadinessSourceSystem =
  | "problem_practice"
  | "material_affordance"
  | "repetition_familiarity"
  | "knowledge_ecology"
  | "canonical_event"
  | "activity_party"
  | "camp_foothold"
  | "foothold_storage"
  | "foothold_fire"
  | "foothold_care"
  | "place_memory"
  | "route_memory"
  | "crossing_memory"
  | "demography"
  | "band_identity";

export type PracticeFeedbackReadinessEvidenceKind =
  | "problem_frame"
  | "practice_candidate"
  | "affordance"
  | "repetition"
  | "activity"
  | "event"
  | "knowledge"
  | "foothold"
  | "camp_signal"
  | "memory"
  | "demography"
  | "identity";

export type PracticeFeedbackLivedBasis = "lived" | "inherited_not_lived" | "mixed" | "unknown";

export type PracticeFeedbackReadinessFeedbackType =
  | "clear_success"
  | "clear_failure"
  | "mixed_feedback"
  | "low_feedback"
  | "delayed_feedback"
  | "dangerous_feedback"
  | "local_only_success"
  | "inherited_no_local_feedback"
  | "contradicted_by_recent_events"
  | "blocked_no_attempt"
  | "familiarity_only";

export type PracticeFeedbackQuality =
  | "clear"
  | "usable"
  | "mixed"
  | "weak"
  | "delayed"
  | "dangerous"
  | "inherited_only"
  | "blocked"
  | "contradicted";

export type PracticeFeedbackReadinessStatus =
  | "not_started"
  | "familiarity_only"
  | "repeated_low_feedback"
  | "repeated_mixed_feedback"
  | "learning_ready_later"
  | "blocked_by_material"
  | "blocked_by_labor"
  | "inherited_not_tested_here"
  | "dead_end_risk"
  | "false_confidence_risk"
  | "local_only"
  | "contradicted";

export type PracticeFeedbackBlocker =
  | "missing_material"
  | "labor_burden"
  | "place_not_stable"
  | "season_or_weather"
  | "feedback_too_weak"
  | "inherited_not_local"
  | "unsupported_ecology"
  | "dangerous_or_contradicted";

export type PracticeFeedbackRisk =
  | "dead_end"
  | "false_confidence"
  | "local_only"
  | "low_feedback"
  | "dangerous_feedback"
  | "delayed_feedback";

export interface PracticeFeedbackEvidenceRef {
  readonly kind: PracticeFeedbackReadinessEvidenceKind;
  readonly sourceSystem: PracticeFeedbackReadinessSourceSystem;
  readonly label: string;
  readonly sourceId: string;
  readonly confidence: NormalizedIntensity;
  readonly livedBasis: PracticeFeedbackLivedBasis;
  readonly problemFrameId?: string;
  readonly practiceCandidateId?: string;
  readonly affordanceId?: string;
  readonly knowledgeId?: string;
  readonly eventId?: string;
  readonly activityId?: string;
  readonly repetitionId?: string;
  readonly footholdId?: string;
  readonly tileId?: TileId;
  readonly reasonIds: readonly ReasonId[];
}

export interface PracticeFeedbackReadinessItem {
  readonly id: string;
  readonly family: PracticeFeedbackReadinessFamily;
  readonly publicLabel: string;
  readonly meaning: string;
  readonly linkedProblemFrameId?: string;
  readonly linkedPracticeCandidateId?: string;
  readonly linkedAffordanceIds: readonly string[];
  readonly linkedKnowledgeIds: readonly string[];
  readonly linkedActivityIds: readonly string[];
  readonly linkedEventIds: readonly string[];
  readonly linkedFootholdIds: readonly string[];
  readonly linkedRepetitionIds: readonly string[];
  readonly repeatedExposureBasis: readonly string[];
  readonly feedbackType: PracticeFeedbackReadinessFeedbackType;
  readonly feedbackQuality: PracticeFeedbackQuality;
  readonly familiaritySignal: string;
  readonly readinessStatus: PracticeFeedbackReadinessStatus;
  readonly blockers: readonly PracticeFeedbackBlocker[];
  readonly risks: readonly PracticeFeedbackRisk[];
  readonly inheritedVsLivedBasis: PracticeFeedbackLivedBasis;
  readonly localTransferClue: string;
  readonly confidence: NormalizedIntensity;
  readonly evidence: readonly PracticeFeedbackEvidenceRef[];
  readonly sourceSystems: readonly PracticeFeedbackReadinessSourceSystem[];
  readonly noSkillUnlocked: true;
  readonly noAutomaticImprovement: true;
  readonly noDecisionInfluence: true;
  readonly learningReadyLaterIsNotSkill: true;
  readonly futureHook: "practice_learning_readiness_candidate";
}

export interface PracticeFeedbackReadinessProfile {
  readonly bandId: BandId;
  readonly generatedAtTick: number;
  readonly generatedAtYear: number;
  readonly projectionMode: "selected_band_projection";
  readonly overviewTitle: string;
  readonly overviewLines: readonly string[];
  readonly items: readonly PracticeFeedbackReadinessItem[];
  readonly familyCounts: Readonly<Record<PracticeFeedbackReadinessFamily, number>>;
  readonly feedbackTypeCounts: Readonly<Record<PracticeFeedbackReadinessFeedbackType, number>>;
  readonly feedbackQualityCounts: Readonly<Record<PracticeFeedbackQuality, number>>;
  readonly readinessStatusCounts: Readonly<Record<PracticeFeedbackReadinessStatus, number>>;
  readonly sourceSystemCounts: Readonly<Record<PracticeFeedbackReadinessSourceSystem, number>>;
  readonly repeatedExposureCount: number;
  readonly deadEndRiskCount: number;
  readonly falseConfidenceRiskCount: number;
  readonly localOnlyRiskCount: number;
  readonly lowFeedbackRiskCount: number;
  readonly blockerCounts: Readonly<Record<PracticeFeedbackBlocker, number>>;
  readonly problemRefCount: number;
  readonly candidateRefCount: number;
  readonly affordanceRefCount: number;
  readonly knowledgeRefCount: number;
  readonly activityRefCount: number;
  readonly eventRefCount: number;
  readonly footholdRefCount: number;
  readonly repetitionRefCount: number;
  readonly inheritedBasisCount: number;
  readonly livedBasisCount: number;
  readonly constraints: readonly string[];
  readonly caps: {
    readonly itemCap: number;
    readonly itemsPerFamilyCap: number;
    readonly evidencePerItemCap: number;
    readonly blockersPerItemCap: number;
    readonly risksPerItemCap: number;
    readonly basisPerItemCap: number;
    readonly linkPerItemCap: number;
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
    readonly learningReadyLaterIsNotSkill: true;
    readonly noCultureTabooMythWorldviewLanguage: true;
    readonly noSettlementInventoryPropertyStorageEconomy: true;
    readonly noAgricultureDomesticationWar: true;
    readonly ignoresLegacyStartingSkills: true;
    readonly inheritedSeparated: boolean;
    readonly daughterParentRoutineNotLocalTesting: boolean;
    readonly badRepetitionRepresented: boolean;
    readonly itemsRequireCandidateOrRepeatedAffordanceBasis: boolean;
  };
  readonly chronicleIntegration: {
    readonly mode: "inspected_skipped";
    readonly reason: string;
    readonly brokenRenderedLinks: 0;
  };
  readonly technicalProof: {
    readonly payloadBytesEstimate: number;
    readonly maxItemPayloadBytes: number;
    readonly sourceIdSamples: readonly string[];
    readonly problemFrameIdSamples: readonly string[];
    readonly practiceCandidateIdSamples: readonly string[];
    readonly affordanceIdSamples: readonly string[];
    readonly knowledgeIdSamples: readonly string[];
    readonly activityIdSamples: readonly string[];
    readonly eventIdSamples: readonly string[];
    readonly footholdIdSamples: readonly string[];
    readonly repetitionIdSamples: readonly string[];
    readonly brokenRenderedLinks: 0;
    readonly legacyStartingSkillProofCount: 0;
    readonly fakeSkillClaimCount: 0;
    readonly fakeCultureClaimCount: 0;
    readonly fakeSettlementInventoryClaimCount: 0;
    readonly decisionPathIsolation: true;
  };
}

interface PracticeFeedbackContext {
  readonly world: WorldState;
  readonly band: Band;
  readonly problemFrames: readonly ProblemFrame[];
  readonly practiceCandidates: readonly PracticeExperimentCandidate[];
  readonly materialItems: readonly MaterialAffordanceItem[];
  readonly campProfile: CampFootholdProfile;
  readonly repetitions: readonly RepetitionAffordanceItem[];
  readonly trips: readonly IntraSeasonTripRecord[];
}

interface ReadinessDraft {
  readonly candidate: PracticeExperimentCandidate;
  readonly frame: ProblemFrame | undefined;
  readonly family: PracticeFeedbackReadinessFamily;
  readonly affordances: readonly MaterialAffordanceItem[];
  readonly repetitions: readonly RepetitionAffordanceItem[];
  readonly campFactors: readonly CampFootholdFactor[];
  readonly evidence: readonly PracticeFeedbackEvidenceRef[];
  readonly exposureScore: number;
  readonly basisScore: number;
}

const FAMILY_ORDER: readonly PracticeFeedbackReadinessFamily[] = [
  "carrying_fiber_handling",
  "food_work_processing",
  "route_crossing",
  "camp_setup_care",
  "fire_hearth_fuel",
  "water_edge_capture",
  "tool_digging_cutting",
];

const FEEDBACK_TYPES: readonly PracticeFeedbackReadinessFeedbackType[] = [
  "clear_success",
  "clear_failure",
  "mixed_feedback",
  "low_feedback",
  "delayed_feedback",
  "dangerous_feedback",
  "local_only_success",
  "inherited_no_local_feedback",
  "contradicted_by_recent_events",
  "blocked_no_attempt",
  "familiarity_only",
];

const FEEDBACK_QUALITIES: readonly PracticeFeedbackQuality[] = [
  "clear",
  "usable",
  "mixed",
  "weak",
  "delayed",
  "dangerous",
  "inherited_only",
  "blocked",
  "contradicted",
];

const READINESS_STATUSES: readonly PracticeFeedbackReadinessStatus[] = [
  "not_started",
  "familiarity_only",
  "repeated_low_feedback",
  "repeated_mixed_feedback",
  "learning_ready_later",
  "blocked_by_material",
  "blocked_by_labor",
  "inherited_not_tested_here",
  "dead_end_risk",
  "false_confidence_risk",
  "local_only",
  "contradicted",
];

const SOURCE_SYSTEMS: readonly PracticeFeedbackReadinessSourceSystem[] = [
  "problem_practice",
  "material_affordance",
  "repetition_familiarity",
  "knowledge_ecology",
  "canonical_event",
  "activity_party",
  "camp_foothold",
  "foothold_storage",
  "foothold_fire",
  "foothold_care",
  "place_memory",
  "route_memory",
  "crossing_memory",
  "demography",
  "band_identity",
];

const BLOCKERS: readonly PracticeFeedbackBlocker[] = [
  "missing_material",
  "labor_burden",
  "place_not_stable",
  "season_or_weather",
  "feedback_too_weak",
  "inherited_not_local",
  "unsupported_ecology",
  "dangerous_or_contradicted",
];

export function derivePracticeFeedbackReadinessProfile(world: WorldState, band: Band): PracticeFeedbackReadinessProfile {
  const problemProfile = deriveProblemPracticeProfile(world, band);
  const materialProfile = deriveMaterialAffordanceProfile(world, band);
  const campProfile = deriveCampFootholdProfile(world, band);
  deriveKnowledgeEcologyProfile(world, band);
  deriveCanonicalEvents(world, band);
  deriveBandIdentityProfile(world, band);

  const context: PracticeFeedbackContext = {
    world,
    band,
    problemFrames: problemProfile.problemFrames,
    practiceCandidates: problemProfile.practiceCandidates,
    materialItems: materialProfile.items,
    campProfile,
    repetitions: [...(band.foragingAdaptation?.repetitionAffordances ?? [])]
      .sort(compareRepetition)
      .slice(0, CONTEXT_RECORD_CAP),
    trips: [...(band.recentIntraSeasonTrips ?? [])]
      .sort(compareTrips)
      .slice(0, CONTEXT_RECORD_CAP),
  };

  const drafts = context.practiceCandidates.map((candidate) => buildDraft(context, candidate));
  const items = capByFamily(drafts)
    .map((draft) => finalizeItem(draft))
    .slice(0, READINESS_ITEM_CAP);
  const evidence = items.flatMap((item) => item.evidence);
  const hasInherited = evidence.some((entry) => entry.livedBasis === "inherited_not_lived");
  const hasLived = evidence.some((entry) => entry.livedBasis === "lived" || entry.livedBasis === "mixed");
  const payloadDraft = {
    bandId: band.id,
    generatedAtTick: Number(world.time.tick),
    generatedAtYear: world.time.year,
    items,
  };

  return {
    bandId: band.id,
    generatedAtTick: Number(world.time.tick),
    generatedAtYear: world.time.year,
    projectionMode: "selected_band_projection",
    overviewTitle: readinessTitle(items),
    overviewLines: readinessLines(items),
    items,
    familyCounts: countByKey(FAMILY_ORDER, items.map((item) => item.family)),
    feedbackTypeCounts: countByKey(FEEDBACK_TYPES, items.map((item) => item.feedbackType)),
    feedbackQualityCounts: countByKey(FEEDBACK_QUALITIES, items.map((item) => item.feedbackQuality)),
    readinessStatusCounts: countByKey(READINESS_STATUSES, items.map((item) => item.readinessStatus)),
    sourceSystemCounts: countByKey(SOURCE_SYSTEMS, evidence.map((entry) => entry.sourceSystem)),
    repeatedExposureCount: items.filter((item) => item.repeatedExposureBasis.length > 0 || item.linkedRepetitionIds.length > 0).length,
    deadEndRiskCount: items.filter((item) => item.risks.includes("dead_end") || item.readinessStatus === "dead_end_risk").length,
    falseConfidenceRiskCount: items.filter((item) => item.risks.includes("false_confidence") || item.readinessStatus === "false_confidence_risk").length,
    localOnlyRiskCount: items.filter((item) => item.risks.includes("local_only") || item.readinessStatus === "local_only").length,
    lowFeedbackRiskCount: items.filter((item) => item.risks.includes("low_feedback") || item.feedbackType === "low_feedback" || item.readinessStatus === "repeated_low_feedback").length,
    blockerCounts: countByKey(BLOCKERS, items.flatMap((item) => item.blockers)),
    problemRefCount: uniqueCount(items.flatMap((item) => item.linkedProblemFrameId === undefined ? [] : [item.linkedProblemFrameId])),
    candidateRefCount: uniqueCount(items.flatMap((item) => item.linkedPracticeCandidateId === undefined ? [] : [item.linkedPracticeCandidateId])),
    affordanceRefCount: uniqueCount(items.flatMap((item) => item.linkedAffordanceIds)),
    knowledgeRefCount: uniqueCount(items.flatMap((item) => item.linkedKnowledgeIds)),
    activityRefCount: uniqueCount(items.flatMap((item) => item.linkedActivityIds)),
    eventRefCount: uniqueCount(items.flatMap((item) => item.linkedEventIds)),
    footholdRefCount: uniqueCount(items.flatMap((item) => item.linkedFootholdIds)),
    repetitionRefCount: uniqueCount(items.flatMap((item) => item.linkedRepetitionIds)),
    inheritedBasisCount: evidence.filter((entry) => entry.livedBasis === "inherited_not_lived").length,
    livedBasisCount: evidence.filter((entry) => entry.livedBasis === "lived" || entry.livedBasis === "mixed").length,
    constraints: [
      "projection only: readiness is not stored and does not change choices",
      "learning-ready later is only a future hook, not a learned method",
      "repetition must have feedback quality and basis; exposure alone is not improvement",
      "daughter and inherited evidence stay separate from local testing",
    ],
    caps: {
      itemCap: READINESS_ITEM_CAP,
      itemsPerFamilyCap: ITEMS_PER_FAMILY_CAP,
      evidencePerItemCap: EVIDENCE_PER_ITEM_CAP,
      blockersPerItemCap: BLOCKERS_PER_ITEM_CAP,
      risksPerItemCap: RISKS_PER_ITEM_CAP,
      basisPerItemCap: BASIS_PER_ITEM_CAP,
      linkPerItemCap: LINK_PER_ITEM_CAP,
      contextRecordCap: CONTEXT_RECORD_CAP,
      capsHeld: items.length <= READINESS_ITEM_CAP &&
        FAMILY_ORDER.every((family) => items.filter((item) => item.family === family).length <= ITEMS_PER_FAMILY_CAP) &&
        items.every((item) =>
          item.evidence.length <= EVIDENCE_PER_ITEM_CAP &&
          item.blockers.length <= BLOCKERS_PER_ITEM_CAP &&
          item.risks.length <= RISKS_PER_ITEM_CAP &&
          item.repeatedExposureBasis.length <= BASIS_PER_ITEM_CAP &&
          item.linkedAffordanceIds.length <= LINK_PER_ITEM_CAP &&
          item.linkedKnowledgeIds.length <= LINK_PER_ITEM_CAP &&
          item.linkedActivityIds.length <= LINK_PER_ITEM_CAP &&
          item.linkedEventIds.length <= LINK_PER_ITEM_CAP &&
          item.linkedFootholdIds.length <= LINK_PER_ITEM_CAP &&
          item.linkedRepetitionIds.length <= LINK_PER_ITEM_CAP),
    },
    integrity: {
      selectedBandOnly: true,
      projectionOnly: true,
      noBehaviorInfluence: true,
      noDecisionInfluence: true,
      noSkillOrAdaptationState: true,
      noAutomaticImprovement: true,
      learningReadyLaterIsNotSkill: true,
      noCultureTabooMythWorldviewLanguage: true,
      noSettlementInventoryPropertyStorageEconomy: true,
      noAgricultureDomesticationWar: true,
      ignoresLegacyStartingSkills: true,
      inheritedSeparated: hasInherited || hasLived || items.length === 0,
      daughterParentRoutineNotLocalTesting: band.parentBandId === undefined ||
        items.every((item) => item.inheritedVsLivedBasis !== "inherited_not_lived" || item.readinessStatus === "inherited_not_tested_here"),
      badRepetitionRepresented: items.some((item) =>
        item.risks.includes("dead_end") ||
        item.risks.includes("false_confidence") ||
        item.risks.includes("low_feedback") ||
        item.risks.includes("local_only") ||
        item.readinessStatus === "dead_end_risk" ||
        item.readinessStatus === "false_confidence_risk" ||
        item.readinessStatus === "repeated_low_feedback"),
      itemsRequireCandidateOrRepeatedAffordanceBasis: items.every((item) =>
        item.linkedPracticeCandidateId !== undefined ||
        (item.linkedRepetitionIds.length > 0 && item.linkedAffordanceIds.length > 0)),
    },
    chronicleIntegration: {
      mode: "inspected_skipped",
      reason: "Practice feedback readiness stays in Practice Feedback and Technical; Chronicle prose is skipped until a later system records actual learned routines or historical attempts.",
      brokenRenderedLinks: 0,
    },
    technicalProof: {
      payloadBytesEstimate: byteLengthUtf8(payloadDraft),
      maxItemPayloadBytes: maxJsonBytes(items),
      sourceIdSamples: uniqueStrings(evidence.map((entry) => entry.sourceId)).slice(0, SAMPLE_CAP),
      problemFrameIdSamples: uniqueStrings(items.flatMap((item) => item.linkedProblemFrameId === undefined ? [] : [item.linkedProblemFrameId])).slice(0, SAMPLE_CAP),
      practiceCandidateIdSamples: uniqueStrings(items.flatMap((item) => item.linkedPracticeCandidateId === undefined ? [] : [item.linkedPracticeCandidateId])).slice(0, SAMPLE_CAP),
      affordanceIdSamples: uniqueStrings(items.flatMap((item) => item.linkedAffordanceIds)).slice(0, SAMPLE_CAP),
      knowledgeIdSamples: uniqueStrings(items.flatMap((item) => item.linkedKnowledgeIds)).slice(0, SAMPLE_CAP),
      activityIdSamples: uniqueStrings(items.flatMap((item) => item.linkedActivityIds)).slice(0, SAMPLE_CAP),
      eventIdSamples: uniqueStrings(items.flatMap((item) => item.linkedEventIds)).slice(0, SAMPLE_CAP),
      footholdIdSamples: uniqueStrings(items.flatMap((item) => item.linkedFootholdIds)).slice(0, SAMPLE_CAP),
      repetitionIdSamples: uniqueStrings(items.flatMap((item) => item.linkedRepetitionIds)).slice(0, SAMPLE_CAP),
      brokenRenderedLinks: 0,
      legacyStartingSkillProofCount: 0,
      fakeSkillClaimCount: 0,
      fakeCultureClaimCount: 0,
      fakeSettlementInventoryClaimCount: 0,
      decisionPathIsolation: true,
    },
  };
}

function buildDraft(context: PracticeFeedbackContext, candidate: PracticeExperimentCandidate): ReadinessDraft {
  const family = familyFromCandidate(candidate.family);
  const frame = context.problemFrames.find((item) => item.id === candidate.problemFrameId);
  const affordances = context.materialItems
    .filter((item) => candidate.relatedAffordanceIds.includes(item.id) || affordanceFamiliesForCandidate(candidate.family).includes(item.family))
    .slice(0, LINK_PER_ITEM_CAP);
  const repetitions = context.repetitions
    .filter((item) => repetitionDomainsForCandidate(candidate.family).includes(item.domain))
    .slice(0, LINK_PER_ITEM_CAP);
  const campFactors = context.campProfile.factors
    .filter((item) => campFamiliesForCandidate(candidate.family).includes(item.family))
    .slice(0, LINK_PER_ITEM_CAP);
  const exposureScore = exposureFromCandidate(candidate) +
    repetitions.reduce((sum, item) => sum + Math.min(4, item.repeatedExposureCount) * 0.18 + item.repeatedAttemptSignal * 0.4, 0) +
    campFactors.length * 0.22;
  const basisScore = affordances.reduce((sum, item) => sum + item.confidence, 0) / Math.max(1, affordances.length) +
    (candidate.relatedKnowledgeIds.length + candidate.relatedActivityIds.length + candidate.relatedEventIds.length) * 0.08 +
    campFactors.reduce((sum, item) => sum + item.confidence, 0) / Math.max(1, campFactors.length + 1);
  const evidence = collectEvidence(context, candidate, frame, affordances, repetitions, campFactors);

  return {
    candidate,
    frame,
    family,
    affordances,
    repetitions,
    campFactors,
    evidence,
    exposureScore,
    basisScore,
  };
}

function finalizeItem(draft: ReadinessDraft): PracticeFeedbackReadinessItem {
  const feedbackType = deriveFeedbackType(draft);
  const feedbackQuality = deriveFeedbackQuality(draft, feedbackType);
  const blockers = deriveBlockers(draft, feedbackType);
  const risks = deriveRisks(draft, feedbackType, feedbackQuality);
  const readinessStatus = deriveReadinessStatus(draft, feedbackType, feedbackQuality, blockers, risks);
  const livedBasis = deriveLivedBasis(draft.evidence);
  const linkedAffordanceIds = uniqueStrings([
    ...draft.candidate.relatedAffordanceIds,
    ...draft.affordances.map((item) => item.id),
  ]).slice(0, LINK_PER_ITEM_CAP);
  const linkedKnowledgeIds = uniqueStrings(draft.candidate.relatedKnowledgeIds).slice(0, LINK_PER_ITEM_CAP);
  const linkedActivityIds = uniqueStrings(draft.candidate.relatedActivityIds).slice(0, LINK_PER_ITEM_CAP);
  const linkedEventIds = uniqueStrings(draft.candidate.relatedEventIds).slice(0, LINK_PER_ITEM_CAP);
  const linkedRepetitionIds = uniqueStrings([
    ...draft.candidate.relatedRepetitionIds,
    ...draft.repetitions.map((item) => item.id),
  ]).slice(0, LINK_PER_ITEM_CAP);
  const linkedFootholdIds = uniqueStrings(draft.campFactors.map((item) => item.id)).slice(0, LINK_PER_ITEM_CAP);
  const repeatedExposureBasis = uniqueStrings([
    ...draft.candidate.activityRepetitionBasis,
    ...draft.repetitions.flatMap((item) => item.evidenceLabels),
    ...draft.campFactors.map((item) => item.publicLabel),
  ]).slice(0, BASIS_PER_ITEM_CAP);
  const confidence = clamp01(0.22 + Math.min(0.36, draft.exposureScore * 0.08) + Math.min(0.28, draft.basisScore * 0.16) + draft.candidate.confidence * 0.18);

  return {
    id: `practice-feedback:${draft.candidate.id}`,
    family: draft.family,
    publicLabel: labelForCandidate(draft.candidate, readinessStatus),
    meaning: meaningForStatus(draft, readinessStatus, feedbackType),
    linkedProblemFrameId: draft.frame?.id,
    linkedPracticeCandidateId: draft.candidate.id,
    linkedAffordanceIds,
    linkedKnowledgeIds,
    linkedActivityIds,
    linkedEventIds,
    linkedFootholdIds,
    linkedRepetitionIds,
    repeatedExposureBasis,
    feedbackType,
    feedbackQuality,
    familiaritySignal: familiaritySignal(draft),
    readinessStatus,
    blockers: blockers.slice(0, BLOCKERS_PER_ITEM_CAP),
    risks: risks.slice(0, RISKS_PER_ITEM_CAP),
    inheritedVsLivedBasis: livedBasis,
    localTransferClue: localTransferClue(draft, risks, livedBasis),
    confidence,
    evidence: draft.evidence.slice(0, EVIDENCE_PER_ITEM_CAP),
    sourceSystems: uniqueSourceSystems(draft.evidence).slice(0, LINK_PER_ITEM_CAP),
    noSkillUnlocked: true,
    noAutomaticImprovement: true,
    noDecisionInfluence: true,
    learningReadyLaterIsNotSkill: true,
    futureHook: "practice_learning_readiness_candidate",
  };
}

function collectEvidence(
  context: PracticeFeedbackContext,
  candidate: PracticeExperimentCandidate,
  frame: ProblemFrame | undefined,
  affordances: readonly MaterialAffordanceItem[],
  repetitions: readonly RepetitionAffordanceItem[],
  campFactors: readonly CampFootholdFactor[],
): readonly PracticeFeedbackEvidenceRef[] {
  const evidence: PracticeFeedbackEvidenceRef[] = [];
  evidence.push({
    kind: "practice_candidate",
    sourceSystem: "problem_practice",
    label: candidate.publicLabel,
    sourceId: candidate.id,
    confidence: candidate.confidence,
    livedBasis: livedBasisFromProblemEvidence(candidate.evidence),
    problemFrameId: candidate.problemFrameId,
    practiceCandidateId: candidate.id,
    reasonIds: [],
  });

  if (frame !== undefined) {
    evidence.push({
      kind: "problem_frame",
      sourceSystem: "problem_practice",
      label: frame.publicLabel,
      sourceId: frame.id,
      confidence: frame.confidence,
      livedBasis: livedBasisFromProblemEvidence(frame.evidence),
      problemFrameId: frame.id,
      reasonIds: [],
    });
  }

  for (const item of affordances.slice(0, 1)) {
    evidence.push({
      kind: "affordance",
      sourceSystem: "material_affordance",
      label: item.publicLabel,
      sourceId: item.id,
      confidence: item.confidence,
      livedBasis: item.livedBasis,
      affordanceId: item.id,
      reasonIds: item.evidence.flatMap((entry) => entry.reasonIds).slice(0, 4),
    });
  }

  for (const item of repetitions.slice(0, 1)) {
    evidence.push({
      kind: "repetition",
      sourceSystem: "repetition_familiarity",
      label: item.title,
      sourceId: item.id,
      confidence: clamp01(item.repeatedAttemptSignal),
      livedBasis: "lived",
      repetitionId: item.id,
      reasonIds: item.reasonIds,
    });
  }

  const trip = context.trips.find((entry) => tripMatchesCandidate(entry, candidate.family));
  if (trip !== undefined) {
    evidence.push({
      kind: "activity",
      sourceSystem: "activity_party",
      label: trip.objectiveLabel,
      sourceId: tripId(trip),
      confidence: 0.64,
      livedBasis: "lived",
      activityId: tripId(trip),
      tileId: trip.targetTileId,
      reasonIds: trip.reasonIds,
    });
  }

  for (const item of campFactors.slice(0, 1)) {
    evidence.push({
      kind: "foothold",
      sourceSystem: "camp_foothold",
      label: item.publicLabel,
      sourceId: item.id,
      confidence: item.confidence,
      livedBasis: item.livedBasis,
      footholdId: item.id,
      reasonIds: item.evidence.flatMap((entry) => entry.reasonIds).slice(0, 4),
    });
  }

  return evidence.slice(0, EVIDENCE_PER_ITEM_CAP);
}

function deriveFeedbackType(draft: ReadinessDraft): PracticeFeedbackReadinessFeedbackType {
  if (draft.candidate.status === "inherited_not_tested_here" || inheritedOnly(draft.evidence)) {
    return "inherited_no_local_feedback";
  }
  if (draft.candidate.status === "blocked_by_missing_material" || draft.candidate.status === "currently_unsupported") {
    return "blocked_no_attempt";
  }
  if (draft.candidate.expectedFeedbackType === "contradicted_by_recent_events") {
    return "contradicted_by_recent_events";
  }
  if (draft.candidate.status === "blocked_by_labor") {
    return "blocked_no_attempt";
  }
  if (draft.repetitions.some((item) => item.feedbackQuality === "negative_feedback")) {
    return draft.candidate.family === "crossing_route_trial" ? "clear_failure" : "dangerous_feedback";
  }
  if (draft.repetitions.some((item) => item.feedbackQuality === "low_feedback")) {
    return "low_feedback";
  }
  if (draft.repetitions.some((item) => item.feedbackQuality === "useful_feedback")) {
    return draft.candidate.expectedFeedbackType === "clear_failure" ? "clear_failure" : "clear_success";
  }
  if (draft.repetitions.some((item) => item.feedbackQuality === "context_bound_feedback")) {
    return "local_only_success";
  }
  if (draft.repetitions.some((item) => item.feedbackQuality === "mixed_feedback") || draft.exposureScore >= 2) {
    return "mixed_feedback";
  }
  if (draft.candidate.status === "plausible_untried") {
    return "familiarity_only";
  }
  return draft.candidate.expectedFeedbackType;
}

function deriveFeedbackQuality(draft: ReadinessDraft, feedbackType: PracticeFeedbackReadinessFeedbackType): PracticeFeedbackQuality {
  switch (feedbackType) {
    case "clear_success":
    case "clear_failure":
      return "clear";
    case "mixed_feedback":
      return "mixed";
    case "low_feedback":
    case "familiarity_only":
      return "weak";
    case "delayed_feedback":
      return "delayed";
    case "dangerous_feedback":
      return "dangerous";
    case "local_only_success":
      return "usable";
    case "inherited_no_local_feedback":
      return "inherited_only";
    case "contradicted_by_recent_events":
      return "contradicted";
    case "blocked_no_attempt":
      return "blocked";
  }
}

function deriveBlockers(draft: ReadinessDraft, feedbackType: PracticeFeedbackReadinessFeedbackType): readonly PracticeFeedbackBlocker[] {
  const blockers: PracticeFeedbackBlocker[] = [];
  if (draft.affordances.length === 0 || draft.candidate.status === "blocked_by_missing_material") {
    blockers.push("missing_material");
  }
  if (draft.candidate.status === "blocked_by_labor" || /labor|work|burden/i.test(`${draft.candidate.laborBurden} ${draft.candidate.likelyCostRisk}`)) {
    blockers.push("labor_burden");
  }
  if (draft.campFactors.length === 0 && (draft.family === "camp_setup_care" || draft.family === "fire_hearth_fuel")) {
    blockers.push("place_not_stable");
  }
  if (draft.family === "food_work_processing" || draft.family === "water_edge_capture" || draft.family === "fire_hearth_fuel") {
    blockers.push("season_or_weather");
  }
  if (feedbackType === "low_feedback" || feedbackType === "familiarity_only") {
    blockers.push("feedback_too_weak");
  }
  if (feedbackType === "inherited_no_local_feedback") {
    blockers.push("inherited_not_local");
  }
  if (draft.family === "water_edge_capture" && draft.candidate.relatedKnowledgeIds.length === 0) {
    blockers.push("unsupported_ecology");
  }
  if (feedbackType === "dangerous_feedback" || feedbackType === "contradicted_by_recent_events") {
    blockers.push("dangerous_or_contradicted");
  }
  return uniqueBlockers(blockers);
}

function deriveRisks(
  draft: ReadinessDraft,
  feedbackType: PracticeFeedbackReadinessFeedbackType,
  feedbackQuality: PracticeFeedbackQuality,
): readonly PracticeFeedbackRisk[] {
  const risks: PracticeFeedbackRisk[] = [];
  if (draft.candidate.deadEndRisk !== "low" || draft.repetitions.some((item) => item.deadEndRisk === "dead_end_attempt" || item.deadEndRisk === "reinforced_bad_habit")) {
    risks.push("dead_end");
  }
  if (draft.candidate.falseConfidenceRisk !== "low" || draft.repetitions.some((item) => item.deadEndRisk === "false_confidence_risk")) {
    risks.push("false_confidence");
  }
  if (draft.candidate.localOnlyRisk !== "low" || feedbackType === "local_only_success" || draft.repetitions.some((item) => item.deadEndRisk === "local_context_only")) {
    risks.push("local_only");
  }
  if (draft.candidate.lowFeedbackRisk !== "low" || feedbackType === "low_feedback" || feedbackType === "familiarity_only") {
    risks.push("low_feedback");
  }
  if (feedbackQuality === "dangerous" || feedbackType === "clear_failure") {
    risks.push("dangerous_feedback");
  }
  if (feedbackType === "delayed_feedback") {
    risks.push("delayed_feedback");
  }
  return uniqueRisks(risks);
}

function deriveReadinessStatus(
  draft: ReadinessDraft,
  feedbackType: PracticeFeedbackReadinessFeedbackType,
  feedbackQuality: PracticeFeedbackQuality,
  blockers: readonly PracticeFeedbackBlocker[],
  risks: readonly PracticeFeedbackRisk[],
): PracticeFeedbackReadinessStatus {
  if (feedbackType === "inherited_no_local_feedback") {
    return "inherited_not_tested_here";
  }
  if (feedbackType === "contradicted_by_recent_events") {
    return "contradicted";
  }
  if (blockers.includes("missing_material")) {
    return "blocked_by_material";
  }
  if (blockers.includes("labor_burden") && draft.exposureScore < 2) {
    return "blocked_by_labor";
  }
  if (risks.includes("dead_end")) {
    return "dead_end_risk";
  }
  if (risks.includes("false_confidence")) {
    return "false_confidence_risk";
  }
  if (risks.includes("local_only") && feedbackType === "local_only_success") {
    return "local_only";
  }
  if (feedbackType === "low_feedback" || (draft.exposureScore >= 2 && feedbackQuality === "weak")) {
    return "repeated_low_feedback";
  }
  if (draft.exposureScore >= 2 && draft.basisScore >= 0.7 && (feedbackQuality === "clear" || feedbackQuality === "usable" || feedbackQuality === "mixed")) {
    return "learning_ready_later";
  }
  if (draft.exposureScore >= 2 && feedbackQuality === "mixed") {
    return "repeated_mixed_feedback";
  }
  if (draft.exposureScore > 0.6 || draft.repetitions.length > 0) {
    return "familiarity_only";
  }
  return "not_started";
}

function capByFamily(drafts: readonly ReadinessDraft[]): readonly ReadinessDraft[] {
  const counts = new Map<PracticeFeedbackReadinessFamily, number>();
  return [...drafts]
    .sort((left, right) => draftScore(right) - draftScore(left) || left.candidate.id.localeCompare(right.candidate.id))
    .filter((draft) => {
      const count = counts.get(draft.family) ?? 0;
      if (count >= ITEMS_PER_FAMILY_CAP) {
        return false;
      }
      counts.set(draft.family, count + 1);
      return true;
    })
    .slice(0, READINESS_ITEM_CAP);
}

function draftScore(draft: ReadinessDraft): number {
  return draft.exposureScore + draft.basisScore + draft.candidate.confidence + (draft.evidence.length * 0.1);
}

function familyFromCandidate(family: PracticeExperimentFamily): PracticeFeedbackReadinessFamily {
  switch (family) {
    case "carrying_container_cordage":
      return "carrying_fiber_handling";
    case "food_processing_trial":
      return "food_work_processing";
    case "crossing_route_trial":
      return "route_crossing";
    case "camp_shelter_care_trial":
      return "camp_setup_care";
    case "fire_hearth_fuel_trial":
      return "fire_hearth_fuel";
    case "water_edge_capture_trial":
      return "water_edge_capture";
    case "tool_digging_cutting_trial":
      return "tool_digging_cutting";
  }
}

function affordanceFamiliesForCandidate(family: PracticeExperimentFamily): readonly MaterialAffordanceFamily[] {
  switch (family) {
    case "carrying_container_cordage":
      return ["carrying_containers_cordage"];
    case "food_processing_trial":
      return ["food_processing", "tool_cutting_scraping_digging"];
    case "crossing_route_trial":
      return ["route_crossing_engineering", "carrying_containers_cordage"];
    case "camp_shelter_care_trial":
      return ["shelter_camp_structure", "camp_organization_care"];
    case "fire_hearth_fuel_trial":
      return ["fire_hearth_fuel"];
    case "water_edge_capture_trial":
      return ["water_edge_trapping"];
    case "tool_digging_cutting_trial":
      return ["tool_cutting_scraping_digging"];
  }
}

function repetitionDomainsForCandidate(family: PracticeExperimentFamily): readonly RepetitionAffordanceDomain[] {
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
      return ["camp_setup", "food_processing", "material_handling"];
    case "water_edge_capture_trial":
      return ["food_work", "material_handling"];
    case "tool_digging_cutting_trial":
      return ["material_handling", "food_work"];
  }
}

function campFamiliesForCandidate(family: PracticeExperimentFamily): readonly CampFootholdFactor["family"][] {
  switch (family) {
    case "carrying_container_cordage":
      return ["temporary_storage_cache", "food_processing_place", "care_camp_organization"];
    case "food_processing_trial":
      return ["food_processing_place", "temporary_storage_cache", "water_refuge"];
    case "crossing_route_trial":
      return ["route_crossing_use", "safety_risk", "repeated_return"];
    case "camp_shelter_care_trial":
      return ["care_camp_organization", "shelter_exposure", "repeated_return"];
    case "fire_hearth_fuel_trial":
      return ["fire_hearth_fuel", "food_processing_place", "shelter_exposure"];
    case "water_edge_capture_trial":
      return ["water_refuge", "food_processing_place", "safety_risk"];
    case "tool_digging_cutting_trial":
      return ["food_processing_place", "care_camp_organization", "camp_ecology_wear"];
  }
}

function tripMatchesCandidate(trip: IntraSeasonTripRecord, family: PracticeExperimentFamily): boolean {
  switch (family) {
    case "carrying_container_cordage":
      return trip.taskGroupType === "plant_gathering_group" || trip.taskGroupType === "local_foraging_group" || trip.taskGroupType === "water_group";
    case "food_processing_trial":
      return trip.taskGroupType === "plant_gathering_group" || trip.taskGroupType === "plant_followup_group" || trip.taskGroupType === "local_foraging_group";
    case "crossing_route_trial":
      return trip.movementType === "memory_refresh_trip" || trip.pathTiles.length > 3;
    case "camp_shelter_care_trial":
      return trip.taskGroupType === "memory_refresh_group" || trip.taskGroupType === "local_foraging_group";
    case "fire_hearth_fuel_trial":
      return trip.taskGroupType === "memory_refresh_group" || trip.taskGroupType === "local_foraging_group";
    case "water_edge_capture_trial":
      return trip.taskGroupType === "fishing_group" || trip.taskGroupType === "water_group";
    case "tool_digging_cutting_trial":
      return trip.taskGroupType === "plant_gathering_group" || trip.taskGroupType === "memory_refresh_group" || trip.taskGroupType === "local_foraging_group";
  }
}

function exposureFromCandidate(candidate: PracticeExperimentCandidate): number {
  return candidate.activityRepetitionBasis.length * 0.4 +
    candidate.relatedActivityIds.length * 0.25 +
    candidate.relatedRepetitionIds.length * 0.35 +
    (candidate.status === "implicit_repetition" || candidate.status === "low_feedback_repetition" ? 1.2 : 0);
}

function familiaritySignal(draft: ReadinessDraft): string {
  const repetition = draft.repetitions[0];
  if (repetition !== undefined) {
    return `${repetition.repeatedExposureCount} exposure signal(s); ${repetition.familiarityStatus.replace(/_/g, " ")}`;
  }
  if (draft.candidate.relatedRepetitionIds.length > 0 || draft.exposureScore > 0.8) {
    return "repeated activity is visible, but feedback remains partial";
  }
  return "no repeated attempt is clear yet";
}

function labelForCandidate(candidate: PracticeExperimentCandidate, status: PracticeFeedbackReadinessStatus): string {
  if (status === "learning_ready_later") {
    return `${candidate.publicLabel} may be ready for later routine learning`;
  }
  if (status === "dead_end_risk") {
    return `${candidate.publicLabel} may be a dead end`;
  }
  if (status === "inherited_not_tested_here") {
    return `${candidate.publicLabel} is inherited or untested here`;
  }
  return candidate.publicLabel;
}

function meaningForStatus(
  draft: ReadinessDraft,
  status: PracticeFeedbackReadinessStatus,
  feedbackType: PracticeFeedbackReadinessFeedbackType,
): string {
  switch (status) {
    case "learning_ready_later":
      return "Repetition, material basis, and feedback are lining up for a future learning system, but nothing is learned yet.";
    case "repeated_low_feedback":
      return "The behavior repeats, but the band is not getting clean enough feedback to support a reliable routine.";
    case "repeated_mixed_feedback":
      return "The behavior repeats with mixed feedback; it may clarify a routine later or expose a wrong lesson.";
    case "dead_end_risk":
      return "The repeated attempt may be reinforcing effort without a better result.";
    case "false_confidence_risk":
      return "The band may become familiar with a local pattern and mistake that familiarity for a reliable method.";
    case "local_only":
      return "Feedback looks tied to this place or season, so it may not travel well.";
    case "blocked_by_material":
      return "A practical basis is visible, but the local material support is too weak for useful feedback.";
    case "blocked_by_labor":
      return "The idea is plausible, but labor burden keeps feedback thin.";
    case "inherited_not_tested_here":
      return "The idea or warning is carried from elsewhere and has not been tested by this band locally.";
    case "contradicted":
      return "Recent events cut against the candidate, so repeated exposure is not becoming a routine.";
    case "familiarity_only":
      return "Familiarity exists, but the feedback does not yet separate useful practice from habit.";
    case "not_started":
      return `The candidate exists, but feedback is still ${practiceFeedbackReadinessFeedbackTypeLabel(feedbackType)}.`;
  }
}

function localTransferClue(
  draft: ReadinessDraft,
  risks: readonly PracticeFeedbackRisk[],
  livedBasis: PracticeFeedbackLivedBasis,
): string {
  if (livedBasis === "inherited_not_lived") {
    return "inherited only; no local transfer clue yet";
  }
  if (risks.includes("local_only")) {
    return "local-only clue; later use elsewhere would need retesting";
  }
  if (draft.campFactors.length > 0) {
    return "place-backed clue; useful only if similar camp conditions recur";
  }
  if (draft.repetitions.length > 0 && draft.affordances.length > 0) {
    return "practice clue is local but has material basis";
  }
  return "transfer remains uncertain";
}

function readinessTitle(items: readonly PracticeFeedbackReadinessItem[]): string {
  const ready = items.filter((item) => item.readinessStatus === "learning_ready_later").length;
  const weak = items.filter((item) => item.readinessStatus === "repeated_low_feedback" || item.readinessStatus === "dead_end_risk").length;
  if (ready > 0) {
    return `${ready} candidate${ready === 1 ? "" : "s"} look learning-ready later`;
  }
  if (weak > 0) {
    return "Repeated trials are mostly weak or risky";
  }
  return "Practice feedback remains early";
}

function readinessLines(items: readonly PracticeFeedbackReadinessItem[]): readonly string[] {
  if (items.length === 0) {
    return ["No feedback-readiness item is grounded yet."];
  }
  const repeated = items.filter((item) => item.repeatedExposureBasis.length > 0).length;
  const bad = items.filter((item) => item.risks.length > 0).length;
  return [
    `${items.length} candidate${items.length === 1 ? "" : "s"} have feedback-readiness records.`,
    `${repeated} show repeated exposure; ${bad} carry dead-end, false-confidence, local-only, dangerous, delayed, or low-feedback risk.`,
    "Readiness is a future hook only; no method, adaptation, or extra effect exists now.",
  ];
}

function livedBasisFromProblemEvidence(evidence: readonly { readonly livedBasis: string }[]): PracticeFeedbackLivedBasis {
  if (evidence.some((entry) => entry.livedBasis === "mixed")) {
    return "mixed";
  }
  const inherited = evidence.some((entry) => entry.livedBasis === "inherited_not_lived");
  const lived = evidence.some((entry) => entry.livedBasis === "lived");
  if (inherited && lived) {
    return "mixed";
  }
  if (inherited) {
    return "inherited_not_lived";
  }
  if (lived) {
    return "lived";
  }
  return "unknown";
}

function deriveLivedBasis(evidence: readonly PracticeFeedbackEvidenceRef[]): PracticeFeedbackLivedBasis {
  if (evidence.some((entry) => entry.livedBasis === "mixed")) {
    return "mixed";
  }
  const inherited = evidence.some((entry) => entry.livedBasis === "inherited_not_lived");
  const lived = evidence.some((entry) => entry.livedBasis === "lived");
  if (inherited && lived) {
    return "mixed";
  }
  if (inherited) {
    return "inherited_not_lived";
  }
  if (lived) {
    return "lived";
  }
  return "unknown";
}

function inheritedOnly(evidence: readonly PracticeFeedbackEvidenceRef[]): boolean {
  return evidence.length > 0 && evidence.every((entry) => entry.livedBasis === "inherited_not_lived");
}

function uniqueSourceSystems(evidence: readonly PracticeFeedbackEvidenceRef[]): readonly PracticeFeedbackReadinessSourceSystem[] {
  const seen = new Set<PracticeFeedbackReadinessSourceSystem>();
  const out: PracticeFeedbackReadinessSourceSystem[] = [];
  for (const item of evidence) {
    if (!seen.has(item.sourceSystem)) {
      seen.add(item.sourceSystem);
      out.push(item.sourceSystem);
    }
  }
  return out;
}

function uniqueBlockers(blockers: readonly PracticeFeedbackBlocker[]): readonly PracticeFeedbackBlocker[] {
  return BLOCKERS.filter((item) => blockers.includes(item));
}

function uniqueRisks(risks: readonly PracticeFeedbackRisk[]): readonly PracticeFeedbackRisk[] {
  const order: readonly PracticeFeedbackRisk[] = ["dead_end", "false_confidence", "local_only", "low_feedback", "dangerous_feedback", "delayed_feedback"];
  return order.filter((item) => risks.includes(item));
}

function countByKey<K extends string>(keys: readonly K[], values: readonly K[]): Readonly<Record<K, number>> {
  const entries = keys.map((key) => [key, values.filter((value) => value === key).length] as const);
  return Object.fromEntries(entries) as Record<K, number>;
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (value.length > 0 && !seen.has(value)) {
      seen.add(value);
      out.push(value);
    }
  }
  return out;
}

function uniqueCount(values: readonly string[]): number {
  return uniqueStrings(values).length;
}

function compareRepetition(left: RepetitionAffordanceItem, right: RepetitionAffordanceItem): number {
  return right.repeatedExposureCount - left.repeatedExposureCount ||
    right.repeatedAttemptSignal - left.repeatedAttemptSignal ||
    left.id.localeCompare(right.id);
}

function compareTrips(left: IntraSeasonTripRecord, right: IntraSeasonTripRecord): number {
  return Number(right.tick) - Number(left.tick) ||
    String(left.targetTileId).localeCompare(String(right.targetTileId)) ||
    left.groupLabel.localeCompare(right.groupLabel);
}

function tripId(trip: IntraSeasonTripRecord): string {
  return `activity:${trip.sourceBandId}:${trip.tick}:${trip.targetTileId}:${trip.taskGroupType}`;
}

function clamp01(value: number): NormalizedIntensity {
  return Math.max(0, Math.min(1, value)) as NormalizedIntensity;
}

function byteLengthUtf8(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

function maxJsonBytes(values: readonly unknown[]): number {
  return Math.max(0, ...values.map((value) => byteLengthUtf8(value)));
}

export function practiceFeedbackReadinessFamilyLabel(family: PracticeFeedbackReadinessFamily): string {
  switch (family) {
    case "carrying_fiber_handling":
      return "Carrying / fiber";
    case "food_work_processing":
      return "Food work";
    case "route_crossing":
      return "Route / crossing";
    case "camp_setup_care":
      return "Camp / care";
    case "fire_hearth_fuel":
      return "Fire / fuel";
    case "water_edge_capture":
      return "Water edge";
    case "tool_digging_cutting":
      return "Tools / digging";
  }
}

export function practiceFeedbackReadinessStatusLabel(status: PracticeFeedbackReadinessStatus): string {
  switch (status) {
    case "not_started":
      return "not started";
    case "familiarity_only":
      return "familiarity only";
    case "repeated_low_feedback":
      return "repeated, weak feedback";
    case "repeated_mixed_feedback":
      return "repeated, mixed feedback";
    case "learning_ready_later":
      return "learning-ready later";
    case "blocked_by_material":
      return "material blocked";
    case "blocked_by_labor":
      return "labor blocked";
    case "inherited_not_tested_here":
      return "inherited, untested here";
    case "dead_end_risk":
      return "dead-end risk";
    case "false_confidence_risk":
      return "false-confidence risk";
    case "local_only":
      return "local only";
    case "contradicted":
      return "contradicted";
  }
}

export function practiceFeedbackReadinessFeedbackTypeLabel(feedback: PracticeFeedbackReadinessFeedbackType): string {
  switch (feedback) {
    case "clear_success":
      return "clear success";
    case "clear_failure":
      return "clear difficulty";
    case "mixed_feedback":
      return "mixed feedback";
    case "low_feedback":
      return "weak feedback";
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
    case "blocked_no_attempt":
      return "blocked, no useful attempt";
    case "familiarity_only":
      return "familiarity only";
  }
}

export function practiceFeedbackQualityLabel(quality: PracticeFeedbackQuality): string {
  switch (quality) {
    case "clear":
      return "clear";
    case "usable":
      return "usable";
    case "mixed":
      return "mixed";
    case "weak":
      return "weak";
    case "delayed":
      return "delayed";
    case "dangerous":
      return "dangerous";
    case "inherited_only":
      return "inherited only";
    case "blocked":
      return "blocked";
    case "contradicted":
      return "contradicted";
  }
}
