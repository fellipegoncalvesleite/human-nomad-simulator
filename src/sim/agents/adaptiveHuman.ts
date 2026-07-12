import type { BandId, DecisionId, EventId, ReasonId, TileId } from "../core/types";
import type { Action, Decision, NormalizedIntensity } from "../rules/types";
import { getTile } from "../world/generate";
import type { WorldState } from "../world/types";
import {
  evaluateCampCareEfficacy,
  evaluateCrossingEfficacy,
} from "./adaptiveEfficacy";
import type {
  CampShiftOutcomeContext,
  CrossingOutcomeContext,
  EfficacyEvaluation,
} from "./adaptiveEfficacy";
import { deriveBandTendencies } from "./bandTendency";
import { deriveCampFootholdProfile } from "./campFoothold";
import { deriveKnowledgeEcologyProfile } from "./knowledgeEcology";
import { deriveMaterialAffordanceProfile } from "./materialAffordance";
import { derivePracticeFeedbackReadinessProfile } from "./practiceFeedbackReadiness";
import { deriveProblemPracticeProfile } from "./problemPractice";
import { deriveSocialEcologicalDiffusionProfile } from "./socialEcologicalDiffusion";
import type {
  AdaptiveBasis,
  AdaptiveBehaviorEffectScope,
  AdaptiveDecisionTrace,
  AdaptiveEfficacyRecord,
  AdaptiveEvidenceRef,
  AdaptiveFeedbackQuality,
  AdaptiveFeedbackType,
  AdaptiveHumanState,
  AdaptiveAttemptOutcome,
  AdaptiveIdea,
  AdaptiveIdeaFamily,
  AdaptiveIdeaSource,
  AdaptiveIdeaStatus,
  AdaptivePassiveCollapseAudit,
  AdaptivePracticeVariant,
  AdaptiveResponse,
  AdaptiveResponseType,
  AdaptiveRoutineConfidenceBand,
  AdaptiveTaskGroup,
  Band,
  ContextBoundAdaptation,
  LocalRoutine,
  RepetitionAffordanceDomain,
  SolutionAttempt,
} from "./types";

const ACTIVE_IDEA_CAP = 8;
const SELECTED_RESPONSE_CAP = 8;
const ATTEMPT_CAP = 14;
const ROUTINE_CAP = 7;
const ADAPTATION_CAP = 3;
const VARIANT_CAP = 8;
const EVIDENCE_PER_ITEM_CAP = 5;
const BASIS_PER_ITEM_CAP = 4;
const BEHAVIOR_BIAS_CAP = 0.24;
const SAMPLE_CAP = 14;

export interface AdaptiveCandidateInfluence {
  readonly ideaId: string;
  readonly responseId: string;
  readonly family: AdaptiveIdeaFamily;
  readonly responseType: AdaptiveResponseType;
  readonly actionTypes: readonly Action["type"][];
  readonly targetTileId?: TileId;
  readonly scoreDelta: NormalizedIntensity;
  readonly behaviorEffectScope: AdaptiveBehaviorEffectScope;
  readonly basis: readonly string[];
  readonly expectedBenefit: string;
  readonly risk: string;
}

export interface AdaptiveDecisionSupport {
  readonly bandId: BandId;
  readonly generatedAtTick: number;
  readonly influences: readonly AdaptiveCandidateInfluence[];
  readonly rejectedIdeaIds: readonly string[];
  readonly maxScoreDelta: NormalizedIntensity;
  readonly noNewActions: true;
  readonly boundedBehaviorInfluence: true;
  readonly antiOmniscient: true;
}

export interface AdaptiveHumanProfile {
  readonly bandId: BandId;
  readonly generatedAtTick: number;
  readonly generatedAtYear: number;
  readonly mode: "behavior_active_bounded";
  readonly overviewTitle: string;
  readonly overviewLines: readonly string[];
  readonly ideas: readonly AdaptiveIdea[];
  readonly selectedResponses: readonly AdaptiveResponse[];
  readonly attempts: readonly SolutionAttempt[];
  readonly localRoutines: readonly LocalRoutine[];
  readonly contextBoundAdaptations: readonly ContextBoundAdaptation[];
  readonly variants: readonly AdaptivePracticeVariant[];
  readonly passiveCollapseAudit?: AdaptivePassiveCollapseAudit;
  readonly ideaFamilyCounts: Readonly<Record<AdaptiveIdeaFamily, number>>;
  readonly responseTypeCounts: Readonly<Record<AdaptiveResponseType, number>>;
  readonly attemptOutcomeCounts: Readonly<Record<AdaptiveFeedbackType, number>>;
  readonly feedbackQualityCounts: Readonly<Record<AdaptiveFeedbackQuality, number>>;
  readonly routineConfidenceCounts: Readonly<Record<AdaptiveRoutineConfidenceBand, number>>;
  readonly selectedIdeaCount: number;
  readonly rejectedIdeaCount: number;
  readonly copiedIdeaCount: number;
  readonly inheritedIdeaCount: number;
  readonly desperateIdeaCount: number;
  readonly deadEndCount: number;
  readonly falseConfidenceCount: number;
  readonly localOnlyCount: number;
  readonly subgroupExecutionCount: number;
  readonly eventRefCount: number;
  readonly problemRefCount: number;
  readonly affordanceRefCount: number;
  readonly knowledgeRefCount: number;
  readonly activityRefCount: number;
  readonly practiceFeedbackRefCount: number;
  readonly campFootholdRefCount: number;
  readonly socialDiffusionRefCount: number;
  readonly behaviorInfluenceTraceCount: number;
  readonly payloadBytesEstimate: number;
  readonly maxIdeasProfile: number;
  readonly maxRoutinesProfile: number;
  readonly maxEvidenceItem: number;
  readonly caps: AdaptiveHumanState["caps"];
  readonly integrity: {
    readonly behaviorActive: true;
    readonly selectedBandProfile: true;
    readonly noNewActions: true;
    readonly noNewEcology: true;
    readonly noTechTree: true;
    readonly noGlobalUnlock: true;
    readonly noAgricultureDomesticationSettlementTerritoryWarCulture: true;
    readonly noAutomaticImprovement: true;
    readonly localRoutinesNotGlobalSkills: true;
    readonly behaviorInfluenceTraced: boolean;
    readonly daughterInheritancePartial: boolean;
    readonly copiedIdeasCanFail: boolean;
  };
  readonly technicalProof: {
    readonly ideaIdSamples: readonly string[];
    readonly responseIdSamples: readonly string[];
    readonly attemptIdSamples: readonly string[];
    readonly routineIdSamples: readonly string[];
    readonly adaptationIdSamples: readonly string[];
    readonly variantIdSamples: readonly string[];
    readonly problemIdSamples: readonly string[];
    readonly affordanceIdSamples: readonly string[];
    readonly practiceFeedbackIdSamples: readonly string[];
    readonly campFootholdIdSamples: readonly string[];
    readonly socialDiffusionIdSamples: readonly string[];
    readonly eventRefSamples: readonly string[];
  };
}

interface DirectIdeaInput {
  readonly world: WorldState;
  readonly band: Band;
  readonly includeCurrentPressure: boolean;
}

interface AttemptInput {
  readonly world: WorldState;
  readonly previousBand: Band;
  readonly updatedBand: Band;
  readonly decision: Decision;
  readonly nextPosition: TileId;
  readonly moved: boolean;
  readonly crossingBlocked: boolean;
  readonly destinationBlocked: boolean;
  readonly observedTileIds: readonly TileId[];
  // ADAPTIVE EFFICACY FEEDBACK-1: decision-time + realized context for
  // response-specific efficacy (built in applyBandDecision from the SAME
  // river assessment / use-pressure records the decision consumed). Optional:
  // absent context simply falls back to the generic movement classification.
  readonly crossingOutcome?: CrossingOutcomeContext;
  readonly campShiftOutcome?: CampShiftOutcomeContext;
}

const IDEA_FAMILIES: readonly AdaptiveIdeaFamily[] = [
  "carrying_logistics",
  "food_work",
  "route_crossing",
  "camp_care",
  "fire_fuel",
  "water_edge",
  "social_copy",
];

const RESPONSE_TYPES: readonly AdaptiveResponseType[] = [
  "stay_endure",
  "rest_recover",
  "minor_camp_shift",
  "temporary_task_camp",
  "scout_probe",
  "try_local_solution",
  "fallback_work_shift",
  "adjust_carrying",
  "delay_move",
  "risky_relocation",
  "abandon_route",
  "return_refuge",
  "copy_trace",
  "reject_idea",
  "postpone",
];

const FEEDBACK_TYPES: readonly AdaptiveFeedbackType[] = [
  "clear_success",
  "clear_failure",
  "partial_success",
  "mixed_feedback",
  "low_feedback",
  "delayed_feedback",
  "dangerous_feedback",
  "local_only_success",
  "contradicted_by_event",
  "false_confidence",
  "dead_end",
  "blocked_before_attempt",
  "too_labor_heavy",
];

const FEEDBACK_QUALITIES: readonly AdaptiveFeedbackQuality[] = [
  "clear",
  "usable",
  "mixed",
  "weak",
  "delayed",
  "dangerous",
  "blocked",
  "contradicted",
];

const ROUTINE_CONFIDENCE_BANDS: readonly AdaptiveRoutineConfidenceBand[] = [
  "fragile",
  "promising",
  "locally_reliable",
  "contradicted",
];

export function deriveAdaptiveDecisionSupport(world: WorldState, band: Band): AdaptiveDecisionSupport {
  const priorIdeas = band.adaptiveHuman?.activeIdeas ?? [];
  const routines = band.adaptiveHuman?.localRoutines ?? [];
  const pressure = collapsePressure(band);
  const influences = [
    ...priorIdeas
      .filter((idea) => idea.status !== "blocked" && idea.status !== "rejected")
      .map((idea) => influenceFromIdea(band, idea, pressure)),
    ...routines
      .filter((routine) => routine.behaviorInfluenceAllowed)
      .map((routine) => influenceFromRoutine(band, routine, pressure)),
  ]
    .filter((entry): entry is AdaptiveCandidateInfluence => entry !== undefined)
    .sort(compareInfluences)
    .slice(0, 5);

  return {
    bandId: band.id,
    generatedAtTick: Number(world.time.tick),
    influences,
    rejectedIdeaIds: priorIdeas
      .filter((idea) => idea.status === "rejected" || idea.status === "blocked")
      .map((idea) => idea.id)
      .slice(0, 6),
    maxScoreDelta: influences.reduce((max, item) => Math.max(max, item.scoreDelta), 0),
    noNewActions: true,
    boundedBehaviorInfluence: true,
    antiOmniscient: true,
  };
}

export function selectAdaptiveInfluenceForAction(
  action: Action,
  support: AdaptiveDecisionSupport | undefined,
): AdaptiveCandidateInfluence | undefined {
  if (support === undefined || support.influences.length === 0) {
    return undefined;
  }
  const targetTileId = actionTargetTileId(action);
  return support.influences.find((influence) =>
    influence.actionTypes.includes(action.type) &&
    (influence.targetTileId === undefined || targetTileId === undefined || influence.targetTileId === targetTileId));
}

export function advanceAdaptiveHumanState(input: AttemptInput): AdaptiveHumanState {
  const prior = input.previousBand.adaptiveHuman;
  const generatedIdeas = deriveDirectAdaptiveIdeas({
    world: input.world,
    band: input.updatedBand,
    includeCurrentPressure: true,
  });
  const selectedIdea = selectIdeaForDecision(input.decision, generatedIdeas, prior);
  const rejectedIdeas = generatedIdeas
    .filter((idea) => selectedIdea === undefined || idea.id !== selectedIdea.id)
    .slice(0, 4)
    .map((idea) => ({
      ...idea,
      status: idea.status === "blocked" ? idea.status : "rejected" as AdaptiveIdeaStatus,
      rejectionReason: rejectionReasonForIdea(input.decision.action, idea),
    }));
  const chosenIdea = selectedIdea === undefined
    ? undefined
    : { ...selectedIdea, status: selectedIdea.status === "desperate" ? selectedIdea.status : "chosen" as AdaptiveIdeaStatus };
  const ideas = capIdeas([
    ...(chosenIdea === undefined ? [] : [chosenIdea]),
    ...rejectedIdeas,
    ...(prior?.activeIdeas ?? []).filter((idea) => idea.status === "copied" || idea.status === "inherited").slice(0, 2),
  ]);
  const response = chosenIdea === undefined
    ? undefined
    : buildAdaptiveResponse(input, chosenIdea, rejectedIdeas);
  // ADAPTIVE EFFICACY FEEDBACK-1: response-specific efficacy is evaluated
  // BEFORE generic classification and, when present, decides the outcome.
  const efficacy = chosenIdea === undefined
    ? undefined
    : evaluateResponseEfficacy(input, chosenIdea);
  const attempt = response === undefined || chosenIdea === undefined
    ? undefined
    : buildSolutionAttempt(input, chosenIdea, response, efficacy);
  const attempts = capAttempts([
    ...(attempt === undefined ? [] : [attempt]),
    ...(prior?.recentAttempts ?? []),
  ]);
  const variants = capVariants([
    ...(attempt === undefined || chosenIdea === undefined ? [] : deriveAttemptVariant(input, chosenIdea, attempt)),
    ...(prior?.variants ?? []),
  ]);
  const routines = attempt === undefined || chosenIdea === undefined
    ? (prior?.localRoutines ?? [])
    : advanceLocalRoutines(prior?.localRoutines ?? [], attempts, chosenIdea, attempt, variants, input.world.time.tick);
  const efficacyRecords = buildEfficacyRecords(
    input,
    prior,
    efficacy,
    attempt,
    chosenIdea,
    prior?.localRoutines ?? [],
    routines,
  );
  const adaptations = advanceContextBoundAdaptations(prior?.contextBoundAdaptations ?? [], routines);
  const responses = capResponses([
    ...(response === undefined ? [] : [response]),
    ...(prior?.selectedResponses ?? []),
  ]);
  const passiveCollapseAudit = derivePassiveCollapseAudit(input.updatedBand, input.world, attempts, generatedIdeas);
  const latestDecisionTrace = buildDecisionTrace(input.decision, response, selectedAdaptiveReason(input.decision));

  return withAdaptiveCaps({
    bandId: input.updatedBand.id,
    lastUpdatedTick: input.world.time.tick,
    activeIdeas: ideas,
    selectedResponses: responses,
    recentAttempts: attempts,
    localRoutines: routines,
    contextBoundAdaptations: adaptations,
    variants,
    passiveCollapseAudit,
    latestDecisionTrace,
    efficacyRecords,
    caps: emptyCaps(false),
    integrity: {
      behaviorActive: true,
      boundedBehaviorInfluence: true,
      noTechTree: true,
      noGlobalUnlock: true,
      noNewEcology: true,
      noCultureSettlementTerritoryTradeWar: true,
      noAutomaticImprovement: true,
      antiOmniscient: true,
    },
  });
}

export function inheritAdaptiveHumanForDaughter(
  parentState: AdaptiveHumanState | undefined,
  daughterBandId: BandId,
  currentTick: AdaptiveHumanState["lastUpdatedTick"],
): AdaptiveHumanState | undefined {
  if (parentState === undefined) {
    return undefined;
  }
  const inheritedIdeas = parentState.activeIdeas
    .filter((idea) => idea.status === "chosen" || idea.status === "copied" || idea.status === "inherited")
    .slice(0, 3)
    .map((idea) => ({
      ...idea,
      id: `adaptive-idea:${String(daughterBandId)}:inherited:${idea.family}:${stableKey(idea.id)}`,
      status: "inherited" as AdaptiveIdeaStatus,
      noveltySource: "inherited" as AdaptiveIdeaSource,
      feasibility: round2(idea.feasibility * 0.58),
      uncertainty: "Inherited as a partial hint from a parent band; not locally tested here.",
      evidence: idea.evidence.slice(0, 2).map((entry) => ({
        ...entry,
        basis: "inherited" as AdaptiveBasis,
        confidence: round2(entry.confidence * 0.58),
      })),
      rejectionReason: undefined,
    }));
  const inheritedVariants = parentState.variants
    .slice(0, 2)
    .map((variant) => ({
      ...variant,
      id: `adaptive-variant:${String(daughterBandId)}:inherited:${stableKey(variant.id)}`,
      status: "untested_variant" as const,
      variantCause: "partial_inheritance" as const,
    }));

  if (inheritedIdeas.length === 0 && inheritedVariants.length === 0) {
    return undefined;
  }

  return withAdaptiveCaps({
    bandId: daughterBandId,
    lastUpdatedTick: currentTick,
    activeIdeas: inheritedIdeas,
    selectedResponses: [],
    recentAttempts: [],
    localRoutines: [],
    contextBoundAdaptations: [],
    variants: inheritedVariants,
    passiveCollapseAudit: undefined,
    latestDecisionTrace: undefined,
    caps: emptyCaps(false),
    integrity: {
      behaviorActive: true,
      boundedBehaviorInfluence: true,
      noTechTree: true,
      noGlobalUnlock: true,
      noNewEcology: true,
      noCultureSettlementTerritoryTradeWar: true,
      noAutomaticImprovement: true,
      antiOmniscient: true,
    },
  });
}

export function deriveAdaptiveHumanProfile(world: WorldState, band: Band): AdaptiveHumanProfile {
  const state = band.adaptiveHuman;
  const directIdeas = deriveDirectAdaptiveIdeas({ world, band, includeCurrentPressure: true });
  const problem = deriveProblemPracticeProfile(world, band);
  const practice = derivePracticeFeedbackReadinessProfile(world, band);
  const material = deriveMaterialAffordanceProfile(world, band);
  const knowledge = deriveKnowledgeEcologyProfile(world, band);
  const foothold = deriveCampFootholdProfile(world, band);
  const social = deriveSocialEcologicalDiffusionProfile(world, band);
  const enrichedIdeas = capIdeas([
    ...(state?.activeIdeas ?? []),
    ...directIdeas.map((idea) => enrichIdeaWithProjectionRefs(idea, { problem, practice, material, knowledge, foothold, social })),
  ]);
  const attempts = state?.recentAttempts ?? [];
  const responses = state?.selectedResponses ?? [];
  const routines = state?.localRoutines ?? [];
  const adaptations = state?.contextBoundAdaptations ?? [];
  const variants = state?.variants ?? [];
  const evidence = enrichedIdeas.flatMap((idea) => idea.evidence);
  const payloadDraft = {
    bandId: band.id,
    generatedAtTick: Number(world.time.tick),
    ideas: enrichedIdeas,
    responses,
    attempts,
    routines,
    adaptations,
    variants,
  };
  const eventRefs = attempts.flatMap((attempt) => attempt.eventRefs);

  return {
    bandId: band.id,
    generatedAtTick: Number(world.time.tick),
    generatedAtYear: world.time.year,
    mode: "behavior_active_bounded",
    overviewTitle: adaptiveOverviewTitle(enrichedIdeas, attempts, routines),
    overviewLines: adaptiveOverviewLines(enrichedIdeas, attempts, routines, adaptations),
    ideas: enrichedIdeas,
    selectedResponses: responses,
    attempts,
    localRoutines: routines,
    contextBoundAdaptations: adaptations,
    variants,
    passiveCollapseAudit: state?.passiveCollapseAudit,
    ideaFamilyCounts: countByKey(IDEA_FAMILIES, enrichedIdeas.map((idea) => idea.family)),
    responseTypeCounts: countByKey(RESPONSE_TYPES, responses.map((response) => response.responseType)),
    attemptOutcomeCounts: countByKey(FEEDBACK_TYPES, attempts.map((attempt) => attempt.feedbackType)),
    feedbackQualityCounts: countByKey(FEEDBACK_QUALITIES, attempts.map((attempt) => attempt.feedbackQuality)),
    routineConfidenceCounts: countByKey(ROUTINE_CONFIDENCE_BANDS, routines.map((routine) => routine.confidenceBand)),
    selectedIdeaCount: enrichedIdeas.filter((idea) => idea.status === "chosen").length,
    rejectedIdeaCount: enrichedIdeas.filter((idea) => idea.status === "rejected" || idea.status === "blocked").length,
    copiedIdeaCount: enrichedIdeas.filter((idea) => idea.noveltySource === "copied_seen" || idea.status === "copied").length,
    inheritedIdeaCount: enrichedIdeas.filter((idea) => idea.noveltySource === "inherited" || idea.status === "inherited").length,
    desperateIdeaCount: enrichedIdeas.filter((idea) => idea.noveltySource === "desperate_improvisation" || idea.status === "desperate").length,
    deadEndCount: attempts.filter((attempt) => attempt.outcome === "dead_end").length + variants.filter((variant) => variant.status === "failed_variant").length,
    falseConfidenceCount: attempts.filter((attempt) => attempt.outcome === "false_confidence").length,
    localOnlyCount: attempts.filter((attempt) => attempt.outcome === "local_only_success").length + routines.filter((routine) => routine.transferDifficulty === "high").length,
    subgroupExecutionCount: attempts.filter((attempt) => attempt.participants !== "whole_band").length,
    eventRefCount: uniqueCount(eventRefs.map(String)),
    problemRefCount: uniqueCount(enrichedIdeas.flatMap((idea) => idea.sourceProblemFrameId === undefined ? [] : [idea.sourceProblemFrameId])),
    affordanceRefCount: uniqueCount(enrichedIdeas.flatMap((idea) => idea.linkedAffordanceIds)),
    knowledgeRefCount: uniqueCount(enrichedIdeas.flatMap((idea) => idea.linkedKnowledgeIds)),
    activityRefCount: uniqueCount(evidence.flatMap((entry) => entry.activityId === undefined ? [] : [entry.activityId])),
    practiceFeedbackRefCount: uniqueCount(enrichedIdeas.flatMap((idea) => idea.linkedPracticeFeedbackIds)),
    campFootholdRefCount: uniqueCount(enrichedIdeas.flatMap((idea) => idea.linkedFootholdIds)),
    socialDiffusionRefCount: uniqueCount(enrichedIdeas.flatMap((idea) => idea.linkedSocialDiffusionIds)),
    behaviorInfluenceTraceCount: state?.latestDecisionTrace?.scoreDelta === undefined || state.latestDecisionTrace.scoreDelta <= 0 ? 0 : 1,
    payloadBytesEstimate: byteLengthUtf8(JSON.stringify(payloadDraft)),
    maxIdeasProfile: ACTIVE_IDEA_CAP,
    maxRoutinesProfile: ROUTINE_CAP,
    maxEvidenceItem: enrichedIdeas.reduce((max, idea) => Math.max(max, idea.evidence.length), 0),
    caps: state?.caps ?? emptyCaps(enrichedIdeas.length <= ACTIVE_IDEA_CAP),
    integrity: {
      behaviorActive: true,
      selectedBandProfile: true,
      noNewActions: true,
      noNewEcology: true,
      noTechTree: true,
      noGlobalUnlock: true,
      noAgricultureDomesticationSettlementTerritoryWarCulture: true,
      noAutomaticImprovement: true,
      localRoutinesNotGlobalSkills: true,
      behaviorInfluenceTraced: state === undefined || state.latestDecisionTrace !== undefined || attempts.length === 0,
      daughterInheritancePartial: band.parentBandId === undefined ||
        enrichedIdeas.every((idea) => idea.status !== "inherited" || attempts.every((attempt) => attempt.ideaId !== idea.id)),
      copiedIdeasCanFail: enrichedIdeas.some((idea) => idea.noveltySource === "copied_seen") === false ||
        enrichedIdeas.some((idea) =>
          idea.noveltySource === "copied_seen" &&
          /tacit|material|fail|misread|partial/i.test(`${idea.risk} ${idea.uncertainty}`)) ||
        attempts.some((attempt) => attempt.outcome === "clear_failure" || attempt.outcome === "dead_end" || attempt.outcome === "mixed_feedback"),
    },
    technicalProof: {
      ideaIdSamples: enrichedIdeas.map((idea) => idea.id).slice(0, SAMPLE_CAP),
      responseIdSamples: responses.map((response) => response.id).slice(0, SAMPLE_CAP),
      attemptIdSamples: attempts.map((attempt) => attempt.id).slice(0, SAMPLE_CAP),
      routineIdSamples: routines.map((routine) => routine.id).slice(0, SAMPLE_CAP),
      adaptationIdSamples: adaptations.map((adaptation) => adaptation.id).slice(0, SAMPLE_CAP),
      variantIdSamples: variants.map((variant) => variant.id).slice(0, SAMPLE_CAP),
      problemIdSamples: uniqueStrings(enrichedIdeas.flatMap((idea) => idea.sourceProblemFrameId === undefined ? [] : [idea.sourceProblemFrameId])).slice(0, SAMPLE_CAP),
      affordanceIdSamples: uniqueStrings(enrichedIdeas.flatMap((idea) => idea.linkedAffordanceIds)).slice(0, SAMPLE_CAP),
      practiceFeedbackIdSamples: uniqueStrings(enrichedIdeas.flatMap((idea) => idea.linkedPracticeFeedbackIds)).slice(0, SAMPLE_CAP),
      campFootholdIdSamples: uniqueStrings(enrichedIdeas.flatMap((idea) => idea.linkedFootholdIds)).slice(0, SAMPLE_CAP),
      socialDiffusionIdSamples: uniqueStrings(enrichedIdeas.flatMap((idea) => idea.linkedSocialDiffusionIds)).slice(0, SAMPLE_CAP),
      eventRefSamples: uniqueStrings(eventRefs.map(String)).slice(0, SAMPLE_CAP),
    },
  };
}

function deriveDirectAdaptiveIdeas(input: DirectIdeaInput): readonly AdaptiveIdea[] {
  const { world, band } = input;
  const ideas: AdaptiveIdea[] = [];
  const pressure = collapsePressure(band);
  const repetitions = band.foragingAdaptation?.repetitionAffordances ?? [];
  const currentTile = getTile(world, band.position);
  const dependentLoad = dependentLoadSignal(band);
  const adultShare = band.demography.workingAdults / Math.max(1, band.demography.population);
  const foodStress = Math.max(band.hungerPressure, band.pressureState?.foodStress ?? 0);
  const waterStress = band.pressureState?.waterStress ?? 0;
  const movePressure = band.pressureState?.netMovePressure ?? band.pressureState?.mobilityPressure ?? 0;
  const routeRepeats = Object.values(band.travelCorridors).reduce((sum, route) => sum + route.useCount, 0);
  const crossingRepeats = Object.values(band.crossingMemories).reduce((sum, crossing) => sum + crossing.useCount, 0);
  const contactCount = Object.values(band.contactMemories).reduce((sum, contact) => sum + contact.contactCount, 0);
  const recentTripCount = band.recentIntraSeasonTrips?.length ?? 0;
  const campStable = band.consecutiveSeasonsOnTile >= 2 || (band.anchorMemories?.[band.position]?.anchoredSeasonCount ?? 0) >= 2;

  if (dependentLoad > 0.28 || repetitionScore(repetitions, ["fiber_handling", "material_handling", "food_work"]) > 0.25 || movePressure > 0.36) {
    ideas.push(makeIdea({
      world,
      band,
      family: "carrying_logistics",
      publicLabel: "Lighten loads and split carrying work",
      meaning: "Moving or food work looks costly enough that smaller loads, fewer carried things, or extra trips may be tried.",
      proposedResponse: "adjust_carrying",
      expectedBenefit: "less burden during movement or close food work",
      expectedCost: "more trips and more exposure to route or camp pressure",
      risk: "can become a dead end if it only repeats extra work",
      uncertainty: "The band may misread a route problem as a carrying problem, or the reverse.",
      feasibility: clamp01(0.34 + dependentLoad * 0.28 + repetitionScore(repetitions, ["fiber_handling", "material_handling"]) * 0.22 + movePressure * 0.18),
      noveltySource: repetitionScore(repetitions, ["fiber_handling", "material_handling"]) > 0.35 ? "repeated_habit" : "locally_inferred",
      materialBasis: basisList(["known carrying burden", repetitionLabel(repetitions, "fiber_handling"), repetitionLabel(repetitions, "material_handling")]),
      knowledgeBasis: basisList(["lived movement and food-work pressure"]),
      activityBasis: recentTripCount > 0 ? [`${recentTripCount} recent task-group record(s)`] : [],
      campFootholdBasis: campStable ? ["reused camp makes load handling visible"] : [],
      evidence: [
        pressureEvidence(band, "carrying/logistical pressure", dependentLoad + movePressure),
        repetitionEvidence(band, repetitions, ["fiber_handling", "material_handling", "food_work"]),
      ],
    }));
  }

  if (foodStress > 0.24 || repetitionScore(repetitions, ["food_work", "food_processing"]) > 0.22 || (band.activityOutcomeSummary?.failedCount ?? 0) > 0) {
    ideas.push(makeIdea({
      world,
      band,
      family: "food_work",
      publicLabel: "Shift food work closer or test a fallback",
      meaning: "Food work is repeated or pressured enough that the band may try known nearby work, a scout, or a fallback routine.",
      proposedResponse: foodStress > 0.5 ? "fallback_work_shift" : "try_local_solution",
      expectedBenefit: "reduce travel cost or find a less brittle food option",
      expectedCost: "may spend labor on low-return work",
      risk: "weak feedback can make a poor food routine feel familiar",
      uncertainty: "Nearby work may be thinning, seasonal, or simply badly remembered.",
      feasibility: clamp01(0.32 + foodStress * 0.32 + repetitionScore(repetitions, ["food_work", "food_processing"]) * 0.28),
      noveltySource: foodStress > 0.58 ? "desperate_improvisation" : "locally_inferred",
      materialBasis: basisList([repetitionLabel(repetitions, "food_processing"), "known food work"]),
      knowledgeBasis: basisList(["food pressure and activity memory"]),
      activityBasis: activityBasis(band),
      campFootholdBasis: campStable ? ["camp can organize near work"] : [],
      evidence: [
        pressureEvidence(band, "food stress", foodStress),
        activityEvidence(band),
        repetitionEvidence(band, repetitions, ["food_work", "food_processing"]),
      ],
    }));
  }

  if (crossingRepeats > 0 || routeRepeats > 2 || movePressure > 0.42 || repetitionScore(repetitions, ["crossing", "route_use"]) > 0.2) {
    ideas.push(makeIdea({
      world,
      band,
      family: "route_crossing",
      publicLabel: "Scout before committing the whole band",
      meaning: "Known routes, crossings, or failed movement make a smaller probe or a lighter crossing response plausible.",
      proposedResponse: "scout_probe",
      expectedBenefit: "avoid committing dependents and heavy loads to a bad route",
      expectedCost: "delays a move and uses adult labor",
      risk: "clear difficulty is not mastery; a successful scout may be local only",
      uncertainty: "The hard part may be the river, the season, the load, or the route memory.",
      feasibility: clamp01(0.3 + Math.min(0.22, crossingRepeats * 0.04) + Math.min(0.18, routeRepeats * 0.02) + movePressure * 0.24),
      noveltySource: crossingRepeats >= 3 ? "repeated_habit" : "locally_inferred",
      materialBasis: basisList(["known routes or crossings"]),
      knowledgeBasis: basisList(["route and crossing memory"]),
      activityBasis: [],
      campFootholdBasis: [],
      evidence: [
        memoryEvidence(band, "route/crossing memory", "route_memory", routeRepeats + crossingRepeats),
        repetitionEvidence(band, repetitions, ["crossing", "route_use"]),
      ],
    }));
  }

  if (dependentLoad > 0.32 || adultShare < 0.48 || campStable || (band.intraSeasonActivity?.activityBudget.restRecovery ?? 0) > 0.2) {
    ideas.push(makeIdea({
      world,
      band,
      family: "camp_care",
      publicLabel: "Rest, reorganize camp, or shift slightly",
      meaning: "Care burden and repeated camp use make a small camp response more plausible than a large invention.",
      proposedResponse: pressure > 0.5 ? "minor_camp_shift" : "rest_recover",
      expectedBenefit: "reduce immediate strain without pretending a permanent camp exists",
      expectedCost: "holding or shifting can miss better opportunities",
      risk: "a familiar camp routine can hide local pressure or depletion",
      uncertainty: "It may be a care problem, a food problem, or simply a bad season.",
      feasibility: clamp01(0.34 + dependentLoad * 0.26 + (campStable ? 0.18 : 0) + Math.max(0, 0.5 - adultShare) * 0.18),
      noveltySource: campStable ? "repeated_habit" : "locally_inferred",
      materialBasis: basisList(["camp work", currentTile === undefined ? undefined : currentTile.terrainKind]),
      knowledgeBasis: basisList(["demography and camp memory"]),
      activityBasis: activityBasis(band),
      campFootholdBasis: campStable ? ["repeated foothold use"] : [],
      evidence: [
        demographyEvidence(band, dependentLoad),
        memoryEvidence(band, "camp/anchor repetition", "place_memory", band.consecutiveSeasonsOnTile),
      ],
    }));
  }

  if (campStable && (repetitionScore(repetitions, ["food_processing"]) > 0.12 || waterStress > 0.18 || foodStress > 0.2)) {
    ideas.push(makeIdea({
      world,
      band,
      family: "fire_fuel",
      publicLabel: "Plan hearth and fuel work around camp",
      meaning: "Repeated camp use and food or water pressure make hearth/fuel organization visible as a practical question.",
      proposedResponse: "try_local_solution",
      expectedBenefit: "make camp work, drying, warmth, or cooking context less costly",
      expectedCost: "fuel gathering and camp time",
      risk: "the feedback may be low unless a clear hardship is avoided",
      uncertainty: "This is camp practice context, not an advanced fire method.",
      feasibility: clamp01(0.26 + (campStable ? 0.22 : 0) + repetitionScore(repetitions, ["food_processing"]) * 0.18 + foodStress * 0.12),
      noveltySource: "locally_inferred",
      materialBasis: basisList(["camp fuel context", repetitionLabel(repetitions, "food_processing")]),
      knowledgeBasis: basisList(["camp return and food-work pressure"]),
      activityBasis: [],
      campFootholdBasis: ["hearth/fuel routines may be visible at a foothold"],
      evidence: [
        memoryEvidence(band, "repeated camp use", "place_memory", band.consecutiveSeasonsOnTile),
        repetitionEvidence(band, repetitions, ["food_processing"]),
      ],
    }));
  }

  if (waterStress > 0.22 || currentTile?.isRiverbank === true || currentTile?.isCoastal === true || currentTile?.terrainKind === "wetlands") {
    ideas.push(makeIdea({
      world,
      band,
      family: "water_edge",
      publicLabel: "Work the water edge cautiously",
      meaning: "Water, wetland, riverbank, lake, or coastal context makes a cautious edge-work attempt plausible.",
      proposedResponse: waterStress > 0.45 ? "return_refuge" : "try_local_solution",
      expectedBenefit: "use known water/refuge or water-edge food context",
      expectedCost: "wet ground, crossings, or seasonal risk",
      risk: "local-only success can be mistaken for general knowledge",
      uncertainty: "No fish ecology or trap skill is assumed.",
      feasibility: clamp01(0.28 + waterStress * 0.28 + (currentTile?.isRiverbank === true ? 0.16 : 0) + (currentTile?.terrainKind === "wetlands" ? 0.14 : 0)),
      noveltySource: "locally_inferred",
      materialBasis: basisList(["known water edge", currentTile?.terrainKind]),
      knowledgeBasis: basisList(["water/refuge memory"]),
      activityBasis: activityBasis(band),
      campFootholdBasis: campStable ? ["water-linked foothold"] : [],
      evidence: [
        pressureEvidence(band, "water/refuge pressure", waterStress),
        memoryEvidence(band, "current water-edge context", "place_memory", currentTile?.isRiverbank === true || currentTile?.isCoastal === true ? 2 : 0),
      ],
    }));
  }

  // RUMOR-LOOP FIX (2026-07-10): only reports that arrived from ANOTHER band
  // can suggest something to copy — a lone band's own scout reports are not
  // "another band's trace" (previously any internal report made a lone band
  // generate copied_seen ideas about nonexistent neighbours).
  const otherBandReportCount = (band.reportedKnowledge?.reports ?? [])
    .filter((report) => report.sourceBandId !== band.id).length;
  if (contactCount > 0 || band.parentBandId !== undefined || otherBandReportCount > 0) {
    ideas.push(makeIdea({
      world,
      band,
      family: "social_copy",
      publicLabel: band.parentBandId === undefined ? "Test a heard or visible trace locally" : "Carry parent hints but test them here",
      meaning: "Other-band contact, parent memory, or reports can suggest an idea, but it remains partial and uncertain.",
      proposedResponse: "copy_trace",
      expectedBenefit: "borrow a hint without assuming full method knowledge",
      expectedCost: "misreading or misplaced trust can waste effort",
      risk: "copied traces can fail when tacit steps or material context differ",
      uncertainty: "The band cannot know another band's full method or intent.",
      feasibility: clamp01(0.24 + Math.min(0.24, contactCount * 0.03) + (band.parentBandId === undefined ? 0 : 0.16)),
      noveltySource: band.parentBandId === undefined ? "copied_seen" : "inherited",
      materialBasis: basisList(["local material still has to fit"]),
      knowledgeBasis: basisList(["contact, report, or inherited parent memory"]),
      activityBasis: [],
      campFootholdBasis: [],
      socialSource: band.parentBandId === undefined ? "contact or report" : "parent-band memory",
      evidence: [
        socialEvidence(band, contactCount),
      ],
    }));
  }

  return capIdeas(ideas.sort(compareIdeas));
}

function makeIdea(input: {
  readonly world: WorldState;
  readonly band: Band;
  readonly family: AdaptiveIdeaFamily;
  readonly publicLabel: string;
  readonly meaning: string;
  readonly proposedResponse: AdaptiveResponseType;
  readonly expectedBenefit: string;
  readonly expectedCost: string;
  readonly risk: string;
  readonly uncertainty: string;
  readonly feasibility: NormalizedIntensity;
  readonly noveltySource: AdaptiveIdeaSource;
  readonly materialBasis: readonly string[];
  readonly knowledgeBasis: readonly string[];
  readonly activityBasis: readonly string[];
  readonly campFootholdBasis: readonly string[];
  readonly socialSource?: string;
  readonly evidence: readonly (AdaptiveEvidenceRef | undefined)[];
}): AdaptiveIdea {
  const status: AdaptiveIdeaStatus =
    input.noveltySource === "desperate_improvisation"
      ? "desperate"
      : input.noveltySource === "copied_seen"
        ? "copied"
        : input.noveltySource === "inherited"
          ? "inherited"
          : input.feasibility < 0.22
            ? "blocked"
            : "considered";
  const evidence = input.evidence.filter((entry): entry is AdaptiveEvidenceRef => entry !== undefined).slice(0, EVIDENCE_PER_ITEM_CAP);
  return {
    id: `adaptive-idea:${String(input.band.id)}:${String(input.world.time.tick)}:${input.family}:${stableKey(input.publicLabel)}`,
    family: input.family,
    publicLabel: input.publicLabel,
    meaning: input.meaning,
    proposedResponse: input.proposedResponse,
    materialBasis: input.materialBasis.slice(0, BASIS_PER_ITEM_CAP),
    knowledgeBasis: input.knowledgeBasis.slice(0, BASIS_PER_ITEM_CAP),
    activityBasis: input.activityBasis.slice(0, BASIS_PER_ITEM_CAP),
    campFootholdBasis: input.campFootholdBasis.slice(0, BASIS_PER_ITEM_CAP),
    socialSource: input.socialSource,
    expectedBenefit: input.expectedBenefit,
    expectedCost: input.expectedCost,
    risk: input.risk,
    uncertainty: input.uncertainty,
    feasibility: round2(input.feasibility),
    noveltySource: input.noveltySource,
    status,
    linkedAffordanceIds: [],
    linkedKnowledgeIds: [],
    linkedPracticeFeedbackIds: [],
    linkedFootholdIds: [],
    linkedSocialDiffusionIds: [],
    evidence,
    noTechTree: true,
    noGlobalUnlock: true,
  };
}

function enrichIdeaWithProjectionRefs(
  idea: AdaptiveIdea,
  context: {
    readonly problem: ReturnType<typeof deriveProblemPracticeProfile>;
    readonly practice: ReturnType<typeof derivePracticeFeedbackReadinessProfile>;
    readonly material: ReturnType<typeof deriveMaterialAffordanceProfile>;
    readonly knowledge: ReturnType<typeof deriveKnowledgeEcologyProfile>;
    readonly foothold: ReturnType<typeof deriveCampFootholdProfile>;
    readonly social: ReturnType<typeof deriveSocialEcologicalDiffusionProfile>;
  },
): AdaptiveIdea {
  const problemFrames = context.problem.problemFrames.filter((frame) => problemFrameMatchesIdea(frame.family, idea.family));
  const candidates = context.problem.practiceCandidates.filter((candidate) => candidateMatchesIdea(candidate.family, idea.family));
  const practiceItems = context.practice.items.filter((item) => readinessMatchesIdea(item.family, idea.family));
  const affordanceIds = uniqueStrings([
    ...candidates.flatMap((candidate) => candidate.relatedAffordanceIds),
    ...practiceItems.flatMap((item) => item.linkedAffordanceIds),
    ...context.material.items.filter((item) => materialMatchesIdea(item.family, idea.family)).map((item) => item.id),
  ]).slice(0, 4);
  const footholdIds = uniqueStrings([
    ...practiceItems.flatMap((item) => item.linkedFootholdIds),
    ...context.foothold.factors.filter((factor) => footholdMatchesIdea(factor.family, idea.family)).map((factor) => factor.id),
  ]).slice(0, 4);
  const socialIds = uniqueStrings(context.social.diffusionItems
    .filter((item) => idea.family === "social_copy" || socialMatchesIdea(item.domain, idea.family))
    .map((item) => item.id)).slice(0, 4);
  const knowledgeIds = uniqueStrings([
    ...problemFrames.flatMap((frame) => frame.relatedKnowledgeIds),
    ...candidates.flatMap((candidate) => candidate.relatedKnowledgeIds),
    ...practiceItems.flatMap((item) => item.linkedKnowledgeIds),
    ...context.knowledge.items.filter((item) => knowledgeMatchesIdea(item.domain, idea.family)).map((item) => item.id),
  ]).slice(0, 4);
  const extraEvidence: AdaptiveEvidenceRef[] = [
    ...problemFrames.slice(0, 1).map((frame) => projectionEvidence("problem", "problem_practice", frame.publicLabel, frame.id, frame.confidence, frame.livedBasis === "inherited_not_lived" ? "inherited" : "lived", { problemFrameId: frame.id })),
    ...candidates.slice(0, 1).map((candidate) => projectionEvidence("practice_candidate", "problem_practice", candidate.publicLabel, candidate.id, candidate.confidence, candidate.status === "inherited_not_tested_here" ? "inherited" : "lived", { practiceCandidateId: candidate.id })),
    ...practiceItems.slice(0, 1).map((item) => projectionEvidence("feedback_readiness", "practice_feedback", item.publicLabel, item.id, item.confidence, item.inheritedVsLivedBasis === "inherited_not_lived" ? "inherited" : "lived", { practiceFeedbackId: item.id })),
    ...context.social.diffusionItems
      .filter((item) => socialIds.includes(item.id))
      .slice(0, 1)
      .map((item) => projectionEvidence("social_exposure", "social_diffusion", item.publicLabel, item.id, item.confidence, item.inheritedVsLocalBasis === "inherited" ? "inherited" : item.inheritedVsLocalBasis === "visible_trace" ? "copied_seen" : "mixed", { socialDiffusionId: item.id })),
  ];
  const evidence = uniqueEvidence([...idea.evidence, ...extraEvidence]).slice(0, EVIDENCE_PER_ITEM_CAP);
  return {
    ...idea,
    sourceProblemFrameId: problemFrames[0]?.id ?? idea.sourceProblemFrameId,
    linkedPracticeCandidateId: candidates[0]?.id ?? idea.linkedPracticeCandidateId,
    linkedAffordanceIds: affordanceIds,
    linkedKnowledgeIds: knowledgeIds,
    linkedPracticeFeedbackIds: uniqueStrings([...idea.linkedPracticeFeedbackIds, ...practiceItems.map((item) => item.id)]).slice(0, 4),
    linkedFootholdIds: footholdIds,
    linkedSocialDiffusionIds: socialIds,
    evidence,
  };
}

function influenceFromIdea(
  band: Band,
  idea: AdaptiveIdea,
  pressure: number,
): AdaptiveCandidateInfluence | undefined {
  const actionTypes = actionTypesForResponse(idea.proposedResponse, idea.family);
  if (actionTypes.length === 0) {
    return undefined;
  }
  const laborPenalty = band.demography.workingAdults <= 3 && idea.proposedResponse !== "rest_recover" ? 0.08 : 0;
  const noveltyRiskPenalty = idea.noveltySource === "copied_seen" || idea.noveltySource === "inherited" ? 0.03 : 0;
  const scoreDelta = clamp01(Math.min(BEHAVIOR_BIAS_CAP, 0.035 + idea.feasibility * 0.12 + pressure * 0.08 - laborPenalty - noveltyRiskPenalty));
  if (scoreDelta <= 0.015) {
    return undefined;
  }
  return {
    ideaId: idea.id,
    responseId: `adaptive-response:${String(band.id)}:${stableKey(idea.id)}`,
    family: idea.family,
    responseType: idea.proposedResponse,
    actionTypes,
    scoreDelta: round2(scoreDelta),
    behaviorEffectScope: effectScopeForResponse(idea.proposedResponse),
    basis: basisList([idea.expectedBenefit, ...idea.materialBasis, ...idea.knowledgeBasis]).slice(0, 4),
    expectedBenefit: idea.expectedBenefit,
    risk: idea.risk,
  };
}

function influenceFromRoutine(
  band: Band,
  routine: LocalRoutine,
  pressure: number,
): AdaptiveCandidateInfluence | undefined {
  const actionTypes = actionTypesForFamilyRoutine(routine.domain);
  if (actionTypes.length === 0) {
    return undefined;
  }
  // CAUSAL-REPAIR-1: routine-reliant bands lean on established local routines
  // a little harder (±15%), still capped by BEHAVIOR_BIAS_CAP.
  const routineRelianceScale = 1 + deriveBandTendencies(band).routineReliance * 0.15;
  const scoreDelta = clamp01(Math.min(BEHAVIOR_BIAS_CAP, (0.03 + routine.confidence * 0.13 + pressure * 0.05 - routine.failureCount * 0.018) * routineRelianceScale));
  if (scoreDelta <= 0.015) {
    return undefined;
  }
  return {
    ideaId: routine.sourceIdeaId,
    responseId: `adaptive-response:${String(band.id)}:${stableKey(routine.id)}`,
    family: routine.domain,
    responseType: responseForFamily(routine.domain),
    actionTypes,
    scoreDelta: round2(scoreDelta),
    behaviorEffectScope: routine.behaviorEffectScope,
    basis: [routine.publicLabel, routine.contextWhereItWorks, `confidence ${routine.confidenceBand}`].slice(0, 4),
    expectedBenefit: "reuse a local routine with remembered limits",
    risk: routine.contextWhereItFails,
  };
}

function selectIdeaForDecision(
  decision: Decision,
  generatedIdeas: readonly AdaptiveIdea[],
  prior: AdaptiveHumanState | undefined,
): AdaptiveIdea | undefined {
  const adaptiveReason = selectedAdaptiveReason(decision);
  if (adaptiveReason !== undefined) {
    return [...generatedIdeas, ...(prior?.activeIdeas ?? [])].find((idea) => idea.id === adaptiveReason.ideaId) ??
      generatedIdeas.find((idea) => idea.family === adaptiveReason.family);
  }
  const action = decision.action;
  return generatedIdeas.find((idea) => actionTypesForResponse(idea.proposedResponse, idea.family).includes(action.type)) ??
    generatedIdeas[0];
}

function buildAdaptiveResponse(
  input: AttemptInput,
  idea: AdaptiveIdea,
  rejectedIdeas: readonly AdaptiveIdea[],
): AdaptiveResponse {
  const reason = selectedAdaptiveReason(input.decision);
  const group = taskGroupForAction(input.decision.action, idea);
  const scoreDelta = reason?.scoreDelta ?? 0;
  return {
    id: reason?.responseId ?? `adaptive-response:${String(input.updatedBand.id)}:${String(input.world.time.tick)}:${stableKey(idea.id)}`,
    selectedIdeaId: idea.id,
    responseType: idea.proposedResponse,
    selectedByProblem: idea.sourceProblemFrameId ?? idea.family,
    whyChosen: reason === undefined
      ? `The chosen action matched the local idea: ${idea.publicLabel}.`
      : `The decision included an adaptive response trace for ${idea.publicLabel}.`,
    rejectedIdeaIds: rejectedIdeas.map((entry) => entry.id).slice(0, 4),
    alternativesRejected: rejectedIdeas.map((entry) => `${entry.publicLabel}: ${entry.rejectionReason ?? "less fitting this season"}`).slice(0, 4),
    expectedCostRisk: `${idea.expectedCost}; ${idea.risk}`,
    laborRequirement: laborRequirement(input.updatedBand, group),
    involvedGroup: group,
    season: input.world.time.season,
    contextTileId: input.previousBand.position,
    decisionId: input.decision.id,
    decisionTrace: `${input.decision.action.type} selected with ${scoreDelta > 0 ? "bounded adaptive bias" : "matching adaptive interpretation"}`,
    behaviorEffectScope: reason?.behaviorEffectScope ?? effectScopeForResponse(idea.proposedResponse),
    scoreDelta: round2(scoreDelta),
  };
}

function buildSolutionAttempt(
  input: AttemptInput,
  idea: AdaptiveIdea,
  response: AdaptiveResponse,
  efficacy: EfficacyEvaluation | undefined,
): SolutionAttempt {
  // ADAPTIVE EFFICACY FEEDBACK-1: response-specific evidence (when it exists)
  // decides the outcome; the generic movement classification is only the
  // fallback for response families without a real efficacy signal.
  const outcome = efficacy?.outcome ?? classifyAttemptOutcome(input, idea, response);
  const eventId = `adaptive-feedback:${String(input.updatedBand.id)}:${String(input.world.time.tick)}:${stableKey(response.id)}` as EventId;
  return {
    id: `solution-attempt:${String(input.updatedBand.id)}:${String(input.world.time.tick)}:${stableKey(response.id)}`,
    ideaId: idea.id,
    responseId: response.id,
    attemptType: response.responseType,
    participants: response.involvedGroup,
    participantEstimate: participantEstimate(input.updatedBand, response.involvedGroup),
    placeTileId: input.previousBand.position,
    targetTileId: actionTargetTileId(input.decision.action),
    materialUsed: idea.materialBasis.slice(0, 3),
    feedbackType: outcome,
    feedbackQuality: qualityForOutcome(outcome),
    outcome,
    eventRefs: [eventId],
    memoryRefs: memoryRefsForAttempt(input.updatedBand, idea),
    costPaid: costForAttempt(input.updatedBand, response, outcome),
    riskRealized: riskForAttempt(outcome),
    helpedEscapeOrSurvive: helpedEscapeOrSurvive(input, outcome),
    blockedReason: blockedReasonForAttempt(input, outcome),
    noAutomaticImprovement: true,
  };
}

function classifyAttemptOutcome(input: AttemptInput, idea: AdaptiveIdea, response: AdaptiveResponse): AdaptiveFeedbackType {
  if (input.crossingBlocked || input.destinationBlocked) {
    return "blocked_before_attempt";
  }
  if (response.laborRequirement === "blocked") {
    return "too_labor_heavy";
  }
  if (input.moved && input.nextPosition !== input.previousBand.position) {
    // ADAPTIVE EFFICACY FEEDBACK-1: families with a response-specific efficacy
    // loop (route_crossing, camp_care) are classified by that loop; if its
    // context is absent, broad movement success must stay WEAK evidence for
    // them — a band moving somewhere is not proof the practice helped.
    if (idea.family === "route_crossing" || idea.family === "camp_care") {
      return "low_feedback";
    }
    return collapsePressure(input.updatedBand) < collapsePressure(input.previousBand)
      ? "clear_success"
      : "partial_success";
  }
  if (input.observedTileIds.some((tileId) => input.previousBand.knowledge.observedTiles[tileId] === undefined)) {
    return idea.noveltySource === "copied_seen" || idea.noveltySource === "inherited"
      ? "mixed_feedback"
      : "partial_success";
  }
  if (input.decision.action.type === "stay") {
    if (collapsePressure(input.updatedBand) > 0.62 && collapsePressure(input.previousBand) > 0.62) {
      return input.updatedBand.consecutiveSeasonsOnTile >= 5 ? "dead_end" : "low_feedback";
    }
    // ADAPTIVE EFFICACY FEEDBACK-1: merely staying is not evidence camp care
    // worked — the camp_care loop credits only a shift whose wear signal fell.
    return "low_feedback";
  }
  if (idea.noveltySource === "copied_seen" || idea.noveltySource === "inherited") {
    return "mixed_feedback";
  }
  if (idea.family === "route_crossing" && (input.updatedBand.pressureState?.riskPressure ?? 0) > 0.52) {
    return "dangerous_feedback";
  }
  return "mixed_feedback";
}

// ADAPTIVE EFFICACY FEEDBACK-1 — dispatch to the response-specific efficacy
// loop for the chosen idea's family. Returns undefined when no specific
// evidence exists so the generic movement classification stays the fallback.
function evaluateResponseEfficacy(input: AttemptInput, idea: AdaptiveIdea): EfficacyEvaluation | undefined {
  if (idea.family === "route_crossing") {
    const demography = input.updatedBand.demography;
    return evaluateCrossingEfficacy({
      context: input.crossingOutcome,
      moved: input.moved,
      priorCrossingMemories: input.previousBand.crossingMemories,
      updatedCrossingMemories: input.updatedBand.crossingMemories,
      currentTick: Number(input.world.time.tick),
      vulnerableShare:
        (demography.dependents + demography.elders) / Math.max(1, demography.population),
      carryConstraint: input.updatedBand.bodyCampLogistics?.behavior?.carryConstraintBias ?? 0,
      waterStress: input.updatedBand.pressureState?.waterStress ?? 0,
    });
  }
  if (idea.family === "camp_care") {
    return evaluateCampCareEfficacy({
      context: input.campShiftOutcome,
      moved: input.moved,
    });
  }
  return undefined;
}

const EFFICACY_RECORD_CAP = 4;

// Persist one compact, bounded proof record per response-specific evaluation:
// which response, in which matching context, whether it was active, which real
// coefficient it touched and by how much, how it was classified, and what its
// outcome did to local routine confidence / failure evidence / future
// influence. Technical shows exactly these records.
function buildEfficacyRecords(
  input: AttemptInput,
  prior: AdaptiveHumanState | undefined,
  efficacy: EfficacyEvaluation | undefined,
  attempt: SolutionAttempt | undefined,
  idea: AdaptiveIdea | undefined,
  priorRoutines: readonly LocalRoutine[],
  nextRoutines: readonly LocalRoutine[],
): readonly AdaptiveEfficacyRecord[] | undefined {
  if (efficacy === undefined || attempt === undefined || idea === undefined) {
    return prior?.efficacyRecords;
  }
  const routineId = routineIdFor(idea, attempt.placeTileId);
  const priorRoutine = priorRoutines.find((routine) => routine.id === routineId);
  const nextRoutine = nextRoutines.find((routine) => routine.id === routineId);
  const confidenceDelta = round2((nextRoutine?.confidence ?? 0) - (priorRoutine?.confidence ?? 0));
  const failureDelta = (nextRoutine?.failureCount ?? 0) - (priorRoutine?.failureCount ?? 0);
  const futureInfluenceChanged =
    (nextRoutine?.behaviorInfluenceAllowed ?? false) !== (priorRoutine?.behaviorInfluenceAllowed ?? false) ||
    Math.abs(confidenceDelta) > 0.001 ||
    Math.abs(efficacy.practiceDelta) > 0.001;
  const record: AdaptiveEfficacyRecord = {
    id: `adaptive-efficacy:${String(input.updatedBand.id)}:${String(input.world.time.tick)}:${stableKey(attempt.responseId)}`,
    tick: input.world.time.tick,
    responseId: attempt.responseId,
    family: efficacy.family,
    classification: efficacy.classification,
    outcome: efficacy.outcome,
    contextKey: efficacy.contextKey,
    responseActive: efficacy.responseActive,
    coefficient: efficacy.coefficient,
    preEffectValue: efficacy.preEffectValue,
    effectAmount: efficacy.effectAmount,
    effectCap: efficacy.effectCap,
    dangerDelta: efficacy.dangerDelta,
    practiceDelta: efficacy.practiceDelta,
    confidenceDelta,
    failureDelta,
    futureInfluenceChanged,
    localityNote: efficacy.localityNote,
    reason: efficacy.reason,
  };
  return [record, ...(prior?.efficacyRecords ?? [])].slice(0, EFFICACY_RECORD_CAP);
}

function routineIdFor(idea: AdaptiveIdea, placeTileId: TileId): string {
  return `local-routine:${stableKey(idea.family)}:${stableKey(idea.proposedResponse)}:${stableKey(String(placeTileId))}`;
}

function advanceLocalRoutines(
  priorRoutines: readonly LocalRoutine[],
  recentAttempts: readonly SolutionAttempt[],
  idea: AdaptiveIdea,
  attempt: SolutionAttempt,
  variants: readonly AdaptivePracticeVariant[],
  currentTick: AdaptiveHumanState["lastUpdatedTick"],
): readonly LocalRoutine[] {
  const routineId = routineIdFor(idea, attempt.placeTileId);
  const existing = priorRoutines.find((routine) => routine.id === routineId);
  const matchingRecentAttempts = recentAttempts.filter((entry) =>
    entry.attemptType === idea.proposedResponse &&
    entry.placeTileId === attempt.placeTileId);
  const recentUsefulCount = matchingRecentAttempts.filter((entry) => isUsefulOutcome(entry.outcome)).length;
  const recentFailureCount = matchingRecentAttempts.filter((entry) => isFailureOutcome(entry.outcome)).length;
  const shouldCreateRoutine =
    existing !== undefined ||
    (matchingRecentAttempts.length >= 2 && recentUsefulCount >= 2);
  if (!shouldCreateRoutine) {
    return priorRoutines;
  }
  const repetitionCount = Math.max(existing?.repetitionCount ?? 0, matchingRecentAttempts.length);
  const successfulFeedbackCount = Math.max(existing?.successfulFeedbackCount ?? 0, recentUsefulCount);
  const failureCount = Math.max(existing?.failureCount ?? 0, recentFailureCount);
  const confidence = round2(clamp01((existing?.confidence ?? 0.18) * 0.7 + successfulFeedbackCount * 0.14 + repetitionCount * 0.035 - failureCount * 0.09));
  const confidenceBand = confidenceBandForRoutine(confidence, failureCount);
  const routine: LocalRoutine = {
    id: routineId,
    sourceIdeaId: idea.id,
    domain: idea.family,
    publicLabel: routineLabel(idea),
    contextWhereItWorks: contextWhereRoutineWorks(idea, attempt),
    contextWhereItFails: contextWhereRoutineFails(idea, attempt),
    confidence,
    confidenceBand,
    carrierBasis: attempt.participants === "whole_band" ? "widely witnessed by the band" : `${attempt.participants.replace(/_/g, " ")} carried the memory`,
    repetitionCount,
    successfulFeedbackCount,
    failureCount,
    lastUsedTick: currentTick,
    transferDifficulty: transferDifficultyForRoutine(idea, confidence, failureCount),
    decayRisk: confidence < 0.38 || attempt.participants !== "whole_band" ? "high" : confidence < 0.62 ? "moderate" : "low",
    mutationHookIds: variants
      .filter((variant) => variant.parentIdeaId === idea.id || variant.parentRoutineId === routineId)
      .map((variant) => variant.id)
      .slice(0, 4),
    behaviorInfluenceAllowed: successfulFeedbackCount >= 2 && confidence >= 0.42 && failureCount <= successfulFeedbackCount,
    behaviorEffectScope: effectScopeForResponse(idea.proposedResponse),
    notGlobalSkill: true,
  };

  return [routine, ...priorRoutines.filter((entry) => entry.id !== routineId)]
    .sort(compareRoutines)
    .slice(0, ROUTINE_CAP);
}

function advanceContextBoundAdaptations(
  prior: readonly ContextBoundAdaptation[],
  routines: readonly LocalRoutine[],
): readonly ContextBoundAdaptation[] {
  const candidates = routines
    .filter((routine) =>
      routine.successfulFeedbackCount >= 4 &&
      routine.repetitionCount >= 5 &&
      routine.confidence >= 0.72 &&
      routine.failureCount <= 1)
    .map((routine) => adaptationFromRoutine(routine));
  return [...uniqueById([...candidates, ...prior])]
    .sort((left, right) => right.confidence - left.confidence || left.id.localeCompare(right.id))
    .slice(0, ADAPTATION_CAP);
}

function adaptationFromRoutine(routine: LocalRoutine): ContextBoundAdaptation {
  return {
    id: `context-adaptation:${stableKey(routine.id)}`,
    sourceRoutineId: routine.id,
    domain: routine.domain,
    bandLocal: true,
    publicLabel: `${routine.publicLabel} is locally reliable`,
    carriers: routine.carrierBasis,
    confidence: routine.confidence,
    limitations: [routine.contextWhereItWorks, "does not travel as a universal method"].slice(0, 3),
    transferDifficulty: routine.transferDifficulty,
    failureConditions: [routine.contextWhereItFails, "different material, season, or route can break it"].slice(0, 3),
    decayRisk: routine.decayRisk,
    decisionInfluence: routine.behaviorEffectScope,
    noGlobalUnlock: true,
    noTechTree: true,
  };
}

function deriveAttemptVariant(
  input: AttemptInput,
  idea: AdaptiveIdea,
  attempt: SolutionAttempt,
): readonly AdaptivePracticeVariant[] {
  const variants: AdaptivePracticeVariant[] = [];
  if (idea.noveltySource === "copied_seen") {
    variants.push(makeVariant(input, idea, "copied_source", attempt, attempt.outcome === "clear_failure" ? "failed_variant" : "untested_variant"));
  }
  if (idea.noveltySource === "inherited") {
    variants.push(makeVariant(input, idea, "partial_inheritance", attempt, "untested_variant"));
  }
  if (attempt.outcome === "clear_failure" || attempt.outcome === "dead_end") {
    variants.push(makeVariant(input, idea, "contradictory_feedback", attempt, "failed_variant"));
  }
  if (attempt.outcome === "local_only_success") {
    variants.push(makeVariant(input, idea, "place_difference", attempt, "local_only_variant"));
  }
  return variants;
}

function makeVariant(
  input: AttemptInput,
  idea: AdaptiveIdea,
  cause: AdaptivePracticeVariant["variantCause"],
  attempt: SolutionAttempt,
  status: AdaptivePracticeVariant["status"],
): AdaptivePracticeVariant {
  return {
    id: `adaptive-variant:${String(input.updatedBand.id)}:${String(input.world.time.tick)}:${stableKey(idea.id)}:${cause}`,
    parentIdeaId: idea.id,
    publicLabel: `${idea.publicLabel} variant`,
    variantCause: cause,
    status,
    evidenceRefs: [attempt.id, ...attempt.eventRefs.map(String)].slice(0, 4),
    noGlobalUnlock: true,
  };
}

function derivePassiveCollapseAudit(
  band: Band,
  world: WorldState,
  attempts: readonly SolutionAttempt[],
  ideas: readonly AdaptiveIdea[],
): AdaptivePassiveCollapseAudit {
  const pressure = collapsePressure(band);
  if (pressure < 0.58 && band.viability?.status !== "fragile" && band.viability?.status !== "nonviable") {
    return {
      bandId: band.id,
      tick: world.time.tick,
      status: "not_under_collapse_pressure",
      collapsePressure: round2(pressure),
      recentAttemptCount: attempts.length,
      blockedReasons: [],
      lastAttemptId: attempts[0]?.id,
    };
  }
  const recentAttemptCount = attempts.filter((attempt) => Number(world.time.tick) - Number(attempt.id.includes(":") ? Number(attempt.id.split(":")[2]) : 0) <= 12).length;
  const blockedReasons = blockedCollapseReasons(band, ideas);
  const status: AdaptivePassiveCollapseAudit["status"] =
    recentAttemptCount > 0
      ? "attempted_response"
      : blockedReasons.length > 0
        ? "blocked_response"
        : "suspicious_passive";
  return {
    bandId: band.id,
    tick: world.time.tick,
    status,
    collapsePressure: round2(pressure),
    recentAttemptCount,
    blockedReasons,
    lastAttemptId: attempts[0]?.id,
  };
}

function buildDecisionTrace(
  decision: Decision,
  response: AdaptiveResponse | undefined,
  reason: ReturnType<typeof selectedAdaptiveReason>,
): AdaptiveDecisionTrace {
  return {
    decisionId: decision.id,
    actionType: decision.action.type,
    selectedIdeaId: response?.selectedIdeaId ?? reason?.ideaId,
    responseId: response?.id ?? reason?.responseId,
    scoreDelta: round2(reason?.scoreDelta ?? response?.scoreDelta ?? 0),
    behaviorEffectScope: response?.behaviorEffectScope ?? reason?.behaviorEffectScope ?? "none",
    reasonId: reason?.reasonId,
  };
}

function selectedAdaptiveReason(decision: Decision): {
  readonly reasonId: ReasonId;
  readonly ideaId: string;
  readonly responseId: string;
  readonly family: AdaptiveIdeaFamily;
  readonly responseType: AdaptiveResponseType;
  readonly scoreDelta: number;
  readonly behaviorEffectScope: AdaptiveBehaviorEffectScope;
} | undefined {
  const reason = decision.secondaryReasons.find((entry) => entry.type === "adaptive_response_selected");
  if (reason === undefined || reason.type !== "adaptive_response_selected") {
    return undefined;
  }
  return {
    reasonId: reason.id,
    ideaId: reason.ideaId,
    responseId: reason.responseId,
    family: isAdaptiveIdeaFamily(reason.family) ? reason.family : "camp_care",
    responseType: isAdaptiveResponseType(reason.responseType) ? reason.responseType : "try_local_solution",
    scoreDelta: reason.scoreDelta,
    behaviorEffectScope: isEffectScope(reason.behaviorEffectScope) ? reason.behaviorEffectScope : "candidate_score_bias",
  };
}

export function adaptiveIdeaFamilyLabel(family: AdaptiveIdeaFamily): string {
  switch (family) {
    case "carrying_logistics": return "Carrying and logistics";
    case "food_work": return "Food work";
    case "route_crossing": return "Routes and crossings";
    case "camp_care": return "Camp and care";
    case "fire_fuel": return "Fire, hearth, and fuel";
    case "water_edge": return "Water edge";
    case "social_copy": return "Other-band hints";
  }
}

export function adaptiveResponseTypeLabel(response: AdaptiveResponseType): string {
  return response.replace(/_/g, " ");
}

export function adaptiveAttemptOutcomeLabel(outcome: AdaptiveAttemptOutcome): string {
  switch (outcome) {
    case "clear_success": return "clear success";
    case "clear_failure": return "clear failure";
    case "partial_success": return "partial success";
    case "mixed_feedback": return "mixed feedback";
    case "low_feedback": return "weak feedback";
    case "delayed_feedback": return "delayed feedback";
    case "dangerous_feedback": return "dangerous feedback";
    case "local_only_success": return "local-only success";
    case "contradicted_by_event": return "contradicted";
    case "false_confidence": return "false confidence";
    case "dead_end": return "dead end";
    case "blocked_before_attempt": return "blocked before attempt";
    case "too_labor_heavy": return "too labor-heavy";
  }
}

function actionTypesForResponse(response: AdaptiveResponseType, family: AdaptiveIdeaFamily): readonly Action["type"][] {
  switch (response) {
    case "rest_recover":
    case "delay_move":
    case "stay_endure":
      return ["stay"];
    case "minor_camp_shift":
    case "return_refuge":
      return ["move_to_tile", "stay"];
    case "temporary_task_camp":
    case "scout_probe":
      return ["logistical_probe", "resource_scout", "explore_unknown_neighbor"];
    case "fallback_work_shift":
      return ["resource_scout", "stay", "move_to_tile"];
    case "adjust_carrying":
      return family === "route_crossing" ? ["logistical_probe", "move_to_tile"] : ["stay", "logistical_probe", "resource_scout"];
    case "risky_relocation":
    case "abandon_route":
      return ["move_to_tile", "explore_unknown_neighbor"];
    case "copy_trace":
      return ["logistical_probe", "resource_scout", "move_to_tile"];
    case "try_local_solution":
      return ["stay", "resource_scout", "logistical_probe"];
    case "reject_idea":
    case "postpone":
      return ["stay"];
  }
}

function actionTypesForFamilyRoutine(family: AdaptiveIdeaFamily): readonly Action["type"][] {
  switch (family) {
    case "carrying_logistics": return ["stay", "logistical_probe", "move_to_tile"];
    case "food_work": return ["resource_scout", "stay", "move_to_tile"];
    case "route_crossing": return ["logistical_probe", "move_to_tile", "explore_unknown_neighbor"];
    case "camp_care": return ["stay", "move_to_tile"];
    case "fire_fuel": return ["stay"];
    case "water_edge": return ["resource_scout", "logistical_probe", "move_to_tile"];
    case "social_copy": return ["logistical_probe", "resource_scout", "move_to_tile"];
  }
}

function responseForFamily(family: AdaptiveIdeaFamily): AdaptiveResponseType {
  switch (family) {
    case "carrying_logistics": return "adjust_carrying";
    case "food_work": return "fallback_work_shift";
    case "route_crossing": return "scout_probe";
    case "camp_care": return "rest_recover";
    case "fire_fuel": return "try_local_solution";
    case "water_edge": return "try_local_solution";
    case "social_copy": return "copy_trace";
  }
}

function effectScopeForResponse(response: AdaptiveResponseType): AdaptiveBehaviorEffectScope {
  switch (response) {
    case "minor_camp_shift":
    case "risky_relocation":
    case "abandon_route":
    case "return_refuge":
      return "movement_response_bias";
    case "scout_probe":
    case "copy_trace":
    case "temporary_task_camp":
      return "scout_response_bias";
    case "rest_recover":
    case "stay_endure":
    case "delay_move":
      return "camp_response_bias";
    case "try_local_solution":
    case "fallback_work_shift":
    case "adjust_carrying":
    case "reject_idea":
    case "postpone":
      return "candidate_score_bias";
  }
}

function actionTargetTileId(action: Action): TileId | undefined {
  switch (action.type) {
    case "stay": return action.tileId;
    case "move_to_tile": return action.targetTileId;
    case "explore_unknown_neighbor": return action.targetTileId;
    case "logistical_probe": return action.targetTileId;
    case "resource_scout": return action.targetTileId;
    case "create_temporary_camp": return action.tileId;
    case "create_seasonal_camp": return action.tileId;
    case "intensify_place_use": return action.tileId;
    case "experiment_with_storage": return action.tileId;
    case "experiment_with_plant_tending": return action.tileId;
    case "start_persistent_settlement": return action.tileId;
    case "reoccupy_site": return undefined;
    case "send_seasonal_outpost": return action.targetTileId;
    case "abandon_expansion_plan": return action.targetTileId;
    case "add_tile_to_route": return action.tileId;
    case "found_daughter_settlement": return action.targetTileId;
    case "claim_influence": return action.targetTileIds[0];
    case "avoid_state_integration": return action.targetTileId;
    default: return undefined;
  }
}

function taskGroupForAction(action: Action, idea: AdaptiveIdea): AdaptiveTaskGroup {
  if (action.type === "stay") {
    return idea.family === "camp_care" || idea.family === "fire_fuel" ? "camp_care_group" : "mixed_camp_group";
  }
  if (action.type === "logistical_probe") {
    return idea.family === "route_crossing" ? "crossing_party" : "small_scout_group";
  }
  if (action.type === "resource_scout") {
    return idea.family === "water_edge" ? "water_edge_group" : "foraging_party";
  }
  if (action.type === "move_to_tile" || action.type === "explore_unknown_neighbor") {
    return "whole_band";
  }
  return "mixed_camp_group";
}

function participantEstimate(band: Band, group: AdaptiveTaskGroup): number {
  switch (group) {
    case "whole_band": return Math.max(1, Math.round(band.demography.population));
    case "camp_care_group": return Math.max(1, Math.round(band.demography.dependents + band.demography.elders + Math.max(1, band.demography.workingAdults * 0.25)));
    case "adult_heavy_group":
    case "crossing_party": return Math.max(1, Math.round(band.demography.workingAdults * 0.55));
    case "small_scout_group": return Math.max(1, Math.round(Math.min(6, band.demography.workingAdults * 0.28)));
    case "foraging_party":
    case "water_edge_group": return Math.max(1, Math.round(band.demography.workingAdults * 0.38));
    case "mixed_camp_group": return Math.max(1, Math.round(band.demography.population * 0.5));
  }
}

function laborRequirement(band: Band, group: AdaptiveTaskGroup): AdaptiveResponse["laborRequirement"] {
  const adults = band.demography.workingAdults;
  if (adults <= 1 && group !== "camp_care_group" && group !== "mixed_camp_group") {
    return "blocked";
  }
  if (group === "whole_band" || group === "adult_heavy_group" || group === "crossing_party") {
    return adults < 5 ? "high" : "moderate";
  }
  if (group === "small_scout_group" || group === "foraging_party" || group === "water_edge_group") {
    return adults < 4 ? "high" : "moderate";
  }
  return "low";
}

function qualityForOutcome(outcome: AdaptiveFeedbackType): AdaptiveFeedbackQuality {
  switch (outcome) {
    case "clear_success":
    case "clear_failure":
      return "clear";
    case "partial_success":
    case "local_only_success":
      return "usable";
    case "mixed_feedback":
    case "false_confidence":
      return "mixed";
    case "low_feedback":
    case "dead_end":
      return "weak";
    case "delayed_feedback":
      return "delayed";
    case "dangerous_feedback":
      return "dangerous";
    case "blocked_before_attempt":
    case "too_labor_heavy":
      return "blocked";
    case "contradicted_by_event":
      return "contradicted";
  }
}

function costForAttempt(band: Band, response: AdaptiveResponse, outcome: AdaptiveFeedbackType): SolutionAttempt["costPaid"] {
  if (outcome === "blocked_before_attempt") return "none";
  if (response.laborRequirement === "high" || outcome === "dangerous_feedback") return "high";
  if (response.laborRequirement === "moderate" || band.demography.workingAdults < 5) return "moderate";
  return "low";
}

function riskForAttempt(outcome: AdaptiveFeedbackType): SolutionAttempt["riskRealized"] {
  switch (outcome) {
    case "dangerous_feedback":
    case "clear_failure":
    case "dead_end":
      return "high";
    case "mixed_feedback":
    case "false_confidence":
    case "too_labor_heavy":
      return "moderate";
    case "partial_success":
    case "local_only_success":
      return "low";
    default:
      return "none";
  }
}

function helpedEscapeOrSurvive(input: AttemptInput, outcome: AdaptiveFeedbackType): boolean {
  return outcome === "clear_success" ||
    outcome === "partial_success" ||
    outcome === "local_only_success" ||
    (input.moved && collapsePressure(input.updatedBand) <= collapsePressure(input.previousBand));
}

function blockedReasonForAttempt(input: AttemptInput, outcome: AdaptiveFeedbackType): string | undefined {
  if (input.crossingBlocked) return "crossing blocked the attempt";
  if (input.destinationBlocked) return "destination was not passable";
  if (outcome === "too_labor_heavy") return "not enough adult labor for the response";
  if (outcome === "blocked_before_attempt") return "blocked before usable feedback";
  return undefined;
}

function memoryRefsForAttempt(band: Band, idea: AdaptiveIdea): readonly string[] {
  const refs = [
    ...idea.evidence.map((entry) => entry.sourceId),
    ...Object.keys(band.placeMemory).slice(0, 1).map((id) => `place:${id}`),
    ...Object.keys(band.travelCorridors).slice(0, 1).map((id) => `route:${id}`),
    ...Object.keys(band.crossingMemories).slice(0, 1).map((id) => `crossing:${id}`),
  ];
  return uniqueStrings(refs).slice(0, 5);
}

function rejectionReasonForIdea(action: Action, idea: AdaptiveIdea): string {
  if (!actionTypesForResponse(idea.proposedResponse, idea.family).includes(action.type)) {
    return `This season's action was ${action.type.replace(/_/g, " ")}, not ${adaptiveResponseTypeLabel(idea.proposedResponse)}.`;
  }
  if (idea.feasibility < 0.3) {
    return "The basis was too weak or blocked.";
  }
  return "A different response fit the pressure better this season.";
}

function isUsefulOutcome(outcome: AdaptiveFeedbackType): boolean {
  return outcome === "clear_success" || outcome === "partial_success" || outcome === "local_only_success";
}

function isFailureOutcome(outcome: AdaptiveFeedbackType): boolean {
  return outcome === "clear_failure" ||
    outcome === "dangerous_feedback" ||
    outcome === "blocked_before_attempt" ||
    outcome === "too_labor_heavy" ||
    outcome === "dead_end" ||
    outcome === "contradicted_by_event";
}

function confidenceBandForRoutine(confidence: number, failureCount: number): AdaptiveRoutineConfidenceBand {
  if (failureCount >= 3) return "contradicted";
  if (confidence >= 0.68) return "locally_reliable";
  if (confidence >= 0.42) return "promising";
  return "fragile";
}

function transferDifficultyForRoutine(idea: AdaptiveIdea, confidence: number, failureCount: number): LocalRoutine["transferDifficulty"] {
  if (idea.noveltySource === "copied_seen" || idea.family === "social_copy" || failureCount > 0) return "high";
  if (idea.family === "route_crossing" || idea.family === "water_edge" || idea.family === "fire_fuel") return "medium";
  return confidence >= 0.68 ? "medium" : "unknown";
}

function routineLabel(idea: AdaptiveIdea): string {
  switch (idea.family) {
    case "carrying_logistics": return "local carrying adjustment";
    case "food_work": return "local food-work response";
    case "route_crossing": return "scout-before-commitment routine";
    case "camp_care": return "camp recovery routine";
    case "fire_fuel": return "hearth and fuel routine";
    case "water_edge": return "water-edge work routine";
    case "social_copy": return "locally tested copied hint";
  }
}

function contextWhereRoutineWorks(idea: AdaptiveIdea, attempt: SolutionAttempt): string {
  if (attempt.outcome === "local_only_success") {
    return "only in this familiar place or season so far";
  }
  return idea.family === "route_crossing"
    ? "on familiar route or crossing evidence"
    : idea.family === "camp_care"
      ? "around a repeated camp or care burden"
      : "where the same material and pressure are present";
}

function contextWhereRoutineFails(idea: AdaptiveIdea, attempt: SolutionAttempt): string {
  if (attempt.blockedReason !== undefined) return attempt.blockedReason;
  if (idea.noveltySource === "copied_seen" || idea.noveltySource === "inherited") {
    return "can fail when tacit steps or local material differ";
  }
  return "can fail in a different season, place, or labor situation";
}

function problemFrameMatchesIdea(problemFamily: string, ideaFamily: AdaptiveIdeaFamily): boolean {
  switch (ideaFamily) {
    case "carrying_logistics": return problemFamily === "carrying_logistical_burden";
    case "food_work": return problemFamily === "food_return_subsistence";
    case "route_crossing": return problemFamily === "crossing_blocked_path" || problemFamily === "route_new_country_uncertainty";
    case "camp_care": return problemFamily === "camp_setup_care_burden";
    case "fire_fuel": return problemFamily === "camp_setup_care_burden" || problemFamily === "food_return_subsistence";
    case "water_edge": return problemFamily === "water_refuge_pressure";
    case "social_copy": return problemFamily === "social_contact_uncertainty" || problemFamily === "route_new_country_uncertainty";
  }
}

function candidateMatchesIdea(candidateFamily: string, ideaFamily: AdaptiveIdeaFamily): boolean {
  switch (ideaFamily) {
    case "carrying_logistics": return candidateFamily === "carrying_container_cordage";
    case "food_work": return candidateFamily === "food_processing_trial" || candidateFamily === "tool_digging_cutting_trial";
    case "route_crossing": return candidateFamily === "crossing_route_trial";
    case "camp_care": return candidateFamily === "camp_shelter_care_trial";
    case "fire_fuel": return candidateFamily === "fire_hearth_fuel_trial";
    case "water_edge": return candidateFamily === "water_edge_capture_trial";
    case "social_copy": return true;
  }
}

function readinessMatchesIdea(readinessFamily: string, ideaFamily: AdaptiveIdeaFamily): boolean {
  switch (ideaFamily) {
    case "carrying_logistics": return readinessFamily === "carrying_fiber_handling";
    case "food_work": return readinessFamily === "food_work_processing" || readinessFamily === "tool_digging_cutting";
    case "route_crossing": return readinessFamily === "route_crossing";
    case "camp_care": return readinessFamily === "camp_setup_care";
    case "fire_fuel": return readinessFamily === "fire_hearth_fuel";
    case "water_edge": return readinessFamily === "water_edge_capture";
    case "social_copy": return true;
  }
}

function materialMatchesIdea(materialFamily: string, ideaFamily: AdaptiveIdeaFamily): boolean {
  switch (ideaFamily) {
    case "carrying_logistics": return materialFamily === "carrying_containers_cordage";
    case "food_work": return materialFamily === "food_processing" || materialFamily === "tool_cutting_scraping_digging";
    case "route_crossing": return materialFamily === "route_crossing_engineering";
    case "camp_care": return materialFamily === "shelter_camp_structure" || materialFamily === "camp_organization_care";
    case "fire_fuel": return materialFamily === "fire_hearth_fuel";
    case "water_edge": return materialFamily === "water_edge_trapping";
    case "social_copy": return false;
  }
}

function footholdMatchesIdea(family: string, ideaFamily: AdaptiveIdeaFamily): boolean {
  switch (ideaFamily) {
    case "camp_care": return family === "care_camp_organization" || family === "shelter_exposure";
    case "fire_fuel": return family === "fire_hearth_fuel";
    case "food_work": return family === "food_processing_place" || family === "temporary_storage_cache";
    case "water_edge": return family === "water_refuge";
    case "route_crossing": return family === "route_crossing_use";
    default: return false;
  }
}

function socialMatchesIdea(domain: string, ideaFamily: AdaptiveIdeaFamily): boolean {
  switch (ideaFamily) {
    case "route_crossing": return domain === "route_crossing";
    case "food_work": return domain === "food_work";
    case "camp_care": return domain === "camp_foothold_care";
    case "fire_fuel": return domain === "fire_hearth_fuel";
    case "water_edge": return domain === "water_edge";
    case "carrying_logistics": return domain === "material_affordance";
    case "social_copy": return true;
  }
}

function knowledgeMatchesIdea(domain: string, ideaFamily: AdaptiveIdeaFamily): boolean {
  switch (ideaFamily) {
    case "route_crossing": return domain === "route_corridor" || domain === "crossing";
    case "food_work": return domain === "food_work";
    case "camp_care": return domain === "place_country" || domain === "water_refuge";
    case "water_edge": return domain === "water_refuge" || domain === "food_work";
    case "social_copy": return domain === "social_contact" || domain === "inherited_memory";
    case "carrying_logistics":
    case "fire_fuel":
      return domain === "food_work" || domain === "place_country";
  }
}

function projectionEvidence(
  kind: AdaptiveEvidenceRef["kind"],
  sourceSystem: AdaptiveEvidenceRef["sourceSystem"],
  label: string,
  sourceId: string,
  confidence: number,
  basis: AdaptiveBasis,
  refs: Partial<Pick<AdaptiveEvidenceRef, "problemFrameId" | "practiceCandidateId" | "practiceFeedbackId" | "socialDiffusionId">>,
): AdaptiveEvidenceRef {
  return {
    kind,
    sourceSystem,
    label,
    sourceId,
    confidence: round2(confidence),
    basis,
    ...refs,
    reasonIds: [],
  };
}

function pressureEvidence(band: Band, label: string, strength: number): AdaptiveEvidenceRef {
  return {
    kind: "pressure",
    sourceSystem: "pressure_state",
    label,
    sourceId: `pressure:${String(band.id)}:${label.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`,
    confidence: round2(clamp01(strength)),
    basis: "lived",
    tileId: band.position,
    reasonIds: [],
  };
}

function demographyEvidence(band: Band, strength: number): AdaptiveEvidenceRef {
  return {
    kind: "demography",
    sourceSystem: "demography",
    label: "dependents, elders, and adult labor shape what can be tried",
    sourceId: `demography:${String(band.id)}`,
    confidence: round2(clamp01(strength)),
    basis: "lived",
    tileId: band.position,
    reasonIds: band.demography.sourceReasonIds.slice(0, 3),
  };
}

function activityEvidence(band: Band): AdaptiveEvidenceRef | undefined {
  const summary = band.activityOutcomeSummary;
  if (summary === undefined) {
    return undefined;
  }
  return {
    kind: "activity",
    sourceSystem: "activity_party",
    label: `${summary.successCount} successful/partial activity records and ${summary.failedCount} failures`,
    sourceId: `activity-summary:${String(band.id)}:${String(summary.tick)}`,
    confidence: round2(clamp01((summary.successCount + summary.partialCount + summary.failedCount) / 8)),
    basis: "lived",
    activityId: `activity-summary:${String(summary.tick)}`,
    tileId: band.position,
    reasonIds: [],
  };
}

function repetitionEvidence(
  band: Band,
  repetitions: readonly { readonly id: string; readonly domain: RepetitionAffordanceDomain; readonly repeatedExposureCount: number; readonly repeatedAttemptSignal: number; readonly reasonIds: readonly ReasonId[] }[],
  domains: readonly RepetitionAffordanceDomain[],
): AdaptiveEvidenceRef | undefined {
  const item = repetitions.find((entry) => domains.includes(entry.domain));
  if (item === undefined) {
    return undefined;
  }
  return {
    kind: "repetition",
    sourceSystem: "repetition_familiarity",
    label: `${item.domain.replace(/_/g, " ")} repetition remains familiarity, not automatic improvement`,
    sourceId: item.id,
    confidence: round2(clamp01((item.repeatedExposureCount + item.repeatedAttemptSignal) / 12)),
    basis: "lived",
    repetitionId: item.id,
    tileId: band.position,
    reasonIds: item.reasonIds.slice(0, 3),
  };
}

function memoryEvidence(band: Band, label: string, sourceSystem: AdaptiveEvidenceRef["sourceSystem"], strength: number): AdaptiveEvidenceRef | undefined {
  if (strength <= 0) {
    return undefined;
  }
  return {
    kind: "memory",
    sourceSystem,
    label,
    sourceId: `${sourceSystem}:${String(band.id)}:${stableKey(label)}`,
    confidence: round2(clamp01(strength / 8)),
    basis: band.parentBandId === undefined ? "lived" : "mixed",
    tileId: band.position,
    reasonIds: [],
  };
}

function socialEvidence(band: Band, contactCount: number): AdaptiveEvidenceRef {
  return {
    kind: "social_exposure",
    sourceSystem: "social_diffusion",
    label: band.parentBandId === undefined ? "contact or report makes a partial hint visible" : "parent-band inheritance is partial and untested here",
    sourceId: band.parentBandId === undefined ? `contact:${String(band.id)}` : `parent:${String(band.parentBandId)}:${String(band.id)}`,
    confidence: round2(clamp01(0.24 + contactCount * 0.04 + (band.parentBandId === undefined ? 0 : 0.18))),
    basis: band.parentBandId === undefined ? "copied_seen" : "inherited",
    relatedBandId: band.parentBandId,
    tileId: band.position,
    reasonIds: [],
  };
}

function repetitionScore(
  repetitions: readonly { readonly domain: RepetitionAffordanceDomain; readonly repeatedExposureCount: number; readonly repeatedAttemptSignal: number }[],
  domains: readonly RepetitionAffordanceDomain[],
): number {
  return clamp01(
    repetitions
      .filter((item) => domains.includes(item.domain))
      .reduce((sum, item) => sum + item.repeatedExposureCount * 0.035 + item.repeatedAttemptSignal * 0.12, 0),
  );
}

function repetitionLabel(
  repetitions: readonly { readonly domain: RepetitionAffordanceDomain; readonly title: string }[],
  domain: RepetitionAffordanceDomain,
): string | undefined {
  return repetitions.find((item) => item.domain === domain)?.title;
}

function activityBasis(band: Band): readonly string[] {
  const summary = band.activityOutcomeSummary;
  if (summary === undefined) {
    return [];
  }
  return [`activity outcomes: ${summary.successCount + summary.partialCount} useful, ${summary.failedCount} failed`];
}

function collapsePressure(band: Band): number {
  return clamp01(Math.max(
    band.hungerPressure,
    band.pressureState?.foodStress ?? 0,
    band.pressureState?.waterStress ?? 0,
    band.pressureState?.netMovePressure ?? 0,
    band.viability?.viabilityPressure ?? 0,
    band.viability?.extinctionRisk ?? 0,
    band.exhaustedRangeAudit?.stressLevel ?? 0,
  ));
}

function dependentLoadSignal(band: Band): number {
  return clamp01((band.demography.dependents + band.demography.elders * 0.72) / Math.max(1, band.demography.population));
}

function blockedCollapseReasons(band: Band, ideas: readonly AdaptiveIdea[]): readonly string[] {
  const reasons: string[] = [];
  if (band.demography.workingAdults <= 1) reasons.push("no adult labor");
  if (ideas.length === 0) reasons.push("no known options surfaced from evidence");
  if (band.knowledge.observedTiles[band.position] === undefined) reasons.push("current place is weakly known");
  if (Object.keys(band.contactMemories).length === 0 && band.parentBandId === undefined) reasons.push("isolated from support/contact evidence");
  if ((band.pressureState?.waterStress ?? 0) > 0.7) reasons.push("water stress too fast");
  return reasons.slice(0, 4);
}

function isAdaptiveIdeaFamily(value: string): value is AdaptiveIdeaFamily {
  return IDEA_FAMILIES.includes(value as AdaptiveIdeaFamily);
}

function isAdaptiveResponseType(value: string): value is AdaptiveResponseType {
  return RESPONSE_TYPES.includes(value as AdaptiveResponseType);
}

function isEffectScope(value: string): value is AdaptiveBehaviorEffectScope {
  return value === "none" ||
    value === "candidate_score_bias" ||
    value === "movement_response_bias" ||
    value === "camp_response_bias" ||
    value === "scout_response_bias";
}

function capIdeas(ideas: readonly AdaptiveIdea[]): readonly AdaptiveIdea[] {
  return [...uniqueById(ideas)]
    .sort(compareIdeas)
    .slice(0, ACTIVE_IDEA_CAP)
    .map((idea) => ({
      ...idea,
      materialBasis: idea.materialBasis.slice(0, BASIS_PER_ITEM_CAP),
      knowledgeBasis: idea.knowledgeBasis.slice(0, BASIS_PER_ITEM_CAP),
      activityBasis: idea.activityBasis.slice(0, BASIS_PER_ITEM_CAP),
      campFootholdBasis: idea.campFootholdBasis.slice(0, BASIS_PER_ITEM_CAP),
      evidence: idea.evidence.slice(0, EVIDENCE_PER_ITEM_CAP),
    }));
}

function capResponses(responses: readonly AdaptiveResponse[]): readonly AdaptiveResponse[] {
  return uniqueById(responses).slice(0, SELECTED_RESPONSE_CAP);
}

function capAttempts(attempts: readonly SolutionAttempt[]): readonly SolutionAttempt[] {
  return uniqueById(attempts).slice(0, ATTEMPT_CAP);
}

function capVariants(variants: readonly AdaptivePracticeVariant[]): readonly AdaptivePracticeVariant[] {
  return uniqueById(variants).slice(0, VARIANT_CAP);
}

function withAdaptiveCaps(state: AdaptiveHumanState): AdaptiveHumanState {
  const capped: AdaptiveHumanState = {
    ...state,
    activeIdeas: state.activeIdeas.slice(0, ACTIVE_IDEA_CAP),
    selectedResponses: state.selectedResponses.slice(0, SELECTED_RESPONSE_CAP),
    recentAttempts: state.recentAttempts.slice(0, ATTEMPT_CAP),
    localRoutines: state.localRoutines.slice(0, ROUTINE_CAP),
    contextBoundAdaptations: state.contextBoundAdaptations.slice(0, ADAPTATION_CAP),
    variants: state.variants.slice(0, VARIANT_CAP),
    efficacyRecords: state.efficacyRecords?.slice(0, EFFICACY_RECORD_CAP),
  };
  return {
    ...capped,
    caps: emptyCaps(
      capped.activeIdeas.length <= ACTIVE_IDEA_CAP &&
        capped.selectedResponses.length <= SELECTED_RESPONSE_CAP &&
        capped.recentAttempts.length <= ATTEMPT_CAP &&
        capped.localRoutines.length <= ROUTINE_CAP &&
        capped.contextBoundAdaptations.length <= ADAPTATION_CAP &&
        capped.variants.length <= VARIANT_CAP &&
        capped.activeIdeas.every((idea) => idea.evidence.length <= EVIDENCE_PER_ITEM_CAP),
    ),
  };
}

function emptyCaps(held: boolean): AdaptiveHumanState["caps"] {
  return {
    activeIdeaCap: ACTIVE_IDEA_CAP,
    selectedResponseCap: SELECTED_RESPONSE_CAP,
    attemptCap: ATTEMPT_CAP,
    routineCap: ROUTINE_CAP,
    adaptationCap: ADAPTATION_CAP,
    variantCap: VARIANT_CAP,
    evidencePerItemCap: EVIDENCE_PER_ITEM_CAP,
    capsHeld: held,
  };
}

function compareIdeas(left: AdaptiveIdea, right: AdaptiveIdea): number {
  return statusRank(right.status) - statusRank(left.status) ||
    right.feasibility - left.feasibility ||
    familyRank(left.family) - familyRank(right.family) ||
    left.id.localeCompare(right.id);
}

function compareInfluences(left: AdaptiveCandidateInfluence, right: AdaptiveCandidateInfluence): number {
  return right.scoreDelta - left.scoreDelta || familyRank(left.family) - familyRank(right.family) || left.ideaId.localeCompare(right.ideaId);
}

function compareRoutines(left: LocalRoutine, right: LocalRoutine): number {
  return right.confidence - left.confidence || right.successfulFeedbackCount - left.successfulFeedbackCount || left.id.localeCompare(right.id);
}

function statusRank(status: AdaptiveIdeaStatus): number {
  switch (status) {
    case "chosen": return 8;
    case "desperate": return 7;
    case "copied": return 6;
    case "inherited": return 5;
    case "considered": return 4;
    case "rejected": return 2;
    case "blocked": return 1;
  }
}

function familyRank(family: AdaptiveIdeaFamily): number {
  return IDEA_FAMILIES.indexOf(family);
}

function uniqueEvidence(evidence: readonly AdaptiveEvidenceRef[]): readonly AdaptiveEvidenceRef[] {
  const seen = new Set<string>();
  const result: AdaptiveEvidenceRef[] = [];
  for (const item of evidence) {
    const key = `${item.sourceSystem}:${item.sourceId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function uniqueById<T extends { readonly id: string }>(items: readonly T[]): readonly T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    result.push(item);
  }
  return result;
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (value.length === 0 || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function uniqueCount(values: readonly string[]): number {
  return uniqueStrings(values).length;
}

function countByKey<TKey extends string>(keys: readonly TKey[], values: readonly TKey[]): Readonly<Record<TKey, number>> {
  const result = keys.reduce<Record<TKey, number>>((acc, key) => {
    acc[key] = 0;
    return acc;
  }, {} as Record<TKey, number>);
  for (const value of values) {
    result[value] = (result[value] ?? 0) + 1;
  }
  return result;
}

function basisList(values: readonly (string | undefined)[]): readonly string[] {
  return uniqueStrings(values.filter((value): value is string => value !== undefined && value.length > 0)).slice(0, BASIS_PER_ITEM_CAP);
}

function stableKey(value: string): string {
  return value.replace(/[^a-zA-Z0-9:_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80).toLowerCase();
}

function adaptiveOverviewTitle(
  ideas: readonly AdaptiveIdea[],
  attempts: readonly SolutionAttempt[],
  routines: readonly LocalRoutine[],
): string {
  if (routines.length > 0) {
    return "Local routines are beginning to form";
  }
  if (attempts.length > 0) {
    return "Ideas are being tried, with mixed feedback";
  }
  if (ideas.length > 0) {
    return "The band has possible responses, not settled methods";
  }
  return "No adaptive response is visible yet";
}

function adaptiveOverviewLines(
  ideas: readonly AdaptiveIdea[],
  attempts: readonly SolutionAttempt[],
  routines: readonly LocalRoutine[],
  adaptations: readonly ContextBoundAdaptation[],
): readonly string[] {
  return [
    ideas.length > 0 ? `${ideas.length} bounded idea(s) are grounded in pressure, memory, material, camp, or social evidence.` : "No grounded idea has enough evidence yet.",
    attempts.length > 0 ? `${attempts.length} recent attempt(s) preserve feedback without making automatic improvement.` : "No recent solution attempt is stored yet.",
    routines.length > 0 ? `${routines.length} local routine(s) have repeated useful feedback, but they remain local and fragile.` : "No local routine has enough repeated useful feedback yet.",
    adaptations.length > 0 ? `${adaptations.length} context-bound adaptation(s) are local only and can fail outside their context.` : "No context-bound adaptation has strong enough evidence yet.",
  ];
}

function byteLengthUtf8(value: string): number {
  return new TextEncoder().encode(value).length;
}

function round2(value: number): NormalizedIntensity {
  return Math.round(clamp01(value) * 100) / 100;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}
