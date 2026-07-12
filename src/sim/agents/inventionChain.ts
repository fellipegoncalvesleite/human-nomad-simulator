// INVENTION-3 — canonical problem → idea → experiment causal chain.
//
// PROBLEM THIS SOLVES: the repository held two partially disconnected
// adaptation architectures. The old problem/idea/solution projections
// (problemPractice / adaptiveHuman cards) described plausible framings but
// were not the causal source of practical inventions, while the real
// practical-response substrate (practicalFragments/practicalResponses)
// created inventions directly from conditions without any recorded problem,
// idea alternatives, or experiment history. This module is the single
// canonical history: every practical response now forms THROUGH a problem
// frame, an idea candidate chosen among alternatives, and a bounded
// experiment whose conclusion is written back from response-specific
// efficacy. UI derives its cards from this state; the cards are never the
// state.
//
// PROPERTIES:
//  * bounded (PROBLEM_CAP/IDEA_CAP/EXPERIMENT_CAP, deterministic eviction);
//  * anti-omniscient (problem evidence is band-known pressure/memory only);
//  * fallible — a frame can be MISREAD: the band may blame the wrong cause
//    (deterministic per band/family/tick, more likely when evidence is
//    ambiguous). A misread frame biases idea selection toward a mechanism
//    that fits the wrong cause; repeated specific failure revises the frame
//    to its competing interpretation (bounded consequence, revisable);
//  * not a tech tree — ideas emerge only from fragment basis + lived
//    condition; rejected ideas keep their reasons and may be re-considered
//    when fragments or conditions change.
//
// Purity: deterministic, no unseeded randomness, no `any`, no UI imports.

import type { TickNumber } from "../core/types";
import { hashSeedString } from "../core/seededVariation";
import type {
  PracticalExperiment,
  PracticalIdeaCandidate,
  PracticalIdeaSource,
  PracticalProblemFamily,
  PracticalProblemFrame,
  PracticalProblemOrigin,
  PracticalResponseFamily,
} from "./types";

export const PROBLEM_CAP = 5;
export const IDEA_CAP = 8;
export const EXPERIMENT_CAP = 4;
const PROBLEM_EVIDENCE_CAP = 3;
const PROBLEM_DORMANT_AFTER_TICKS = 8; // 2y without fresh evidence
const PROBLEM_RESOLVED_CONFIDENCE = 0.25;

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// Deterministic 0..1 roll from a stable identity (same mixing family as
// bandTendency.traitFromIdentity — FNV + murmur-style finalizer).
export function deterministicRoll(identity: string): number {
  let hash = hashSeedString(`invention-chain:${identity}`);
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 2246822519);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 3266489917);
  hash ^= hash >>> 16;
  return (hash >>> 0) / 4294967295;
}

// ---------------------------------------------------------------------------
// Problem signals → frames.
// ---------------------------------------------------------------------------

export interface ProblemSignal {
  readonly family: PracticalProblemFamily;
  readonly publicLabel: string;
  // 0..1 — how strongly the band's own evidence presents this problem NOW.
  readonly severity: number;
  // 0..1 — how clearly the evidence points at one cause (low = ambiguous).
  readonly confidence: number;
  // The reading the evidence most supports.
  readonly interpretation: string;
  // A plausible wrong (or alternative) reading; misread frames adopt it.
  readonly competingInterpretation?: string;
  // 0..1 — how easy it is to blame the wrong cause here.
  readonly ambiguity: number;
  readonly evidenceRefs: readonly string[];
  readonly contextKey?: string;
  readonly origin: PracticalProblemOrigin;
}

export interface AdvanceProblemFramesInput {
  readonly bandId: string;
  readonly prior: readonly PracticalProblemFrame[];
  readonly signals: readonly ProblemSignal[];
  readonly currentTick: TickNumber;
  // Frames whose linked experiment failed under a misread this season —
  // these revise to the competing interpretation.
  readonly reviseProblemIds?: readonly string[];
  // Frames whose linked response measurably resolved the condition.
  readonly resolveProblemIds?: readonly string[];
}

export function problemFrameId(bandId: string, family: PracticalProblemFamily): string {
  return `problem:${bandId}:${family}`;
}

/**
 * Advance the bounded problem-frame list one season. One frame per problem
 * family (the frame accumulates repetition; its severity tracks the latest
 * evidence). Frames without fresh evidence go dormant, then resolve.
 */
export function advanceProblemFrames(input: AdvanceProblemFramesInput): readonly PracticalProblemFrame[] {
  const tick = Number(input.currentTick);
  const byId = new Map<string, PracticalProblemFrame>(input.prior.map((frame) => [frame.id, frame]));

  for (const signal of input.signals) {
    if (signal.severity <= 0) {
      continue;
    }
    const id = problemFrameId(input.bandId, signal.family);
    const existing = byId.get(id);
    if (existing === undefined) {
      // Misreading is decided when the frame is FIRST formed: ambiguous
      // evidence can convince the band of the wrong cause. Deterministic per
      // band/family/tick; bounded by ambiguity (unambiguous evidence is
      // never misread).
      const roll = deterministicRoll(`${input.bandId}:${signal.family}:${tick}`);
      const misread = signal.competingInterpretation !== undefined &&
        signal.ambiguity >= 0.3 &&
        roll < signal.ambiguity * 0.55;
      byId.set(id, {
        id,
        family: signal.family,
        publicLabel: signal.publicLabel,
        interpretation: misread ? signal.competingInterpretation ?? signal.interpretation : signal.interpretation,
        competingInterpretation: misread ? signal.interpretation : signal.competingInterpretation,
        misread,
        severity: round2(signal.severity),
        confidence: round2(clamp01(signal.confidence * (misread ? 0.85 : 1))),
        repetitionCount: 1,
        origin: signal.origin,
        status: "active",
        evidenceRefs: signal.evidenceRefs.slice(0, PROBLEM_EVIDENCE_CAP),
        contextKey: signal.contextKey,
        framedAtTick: input.currentTick,
        lastEvidenceTick: input.currentTick,
      });
    } else {
      byId.set(id, {
        ...existing,
        publicLabel: signal.publicLabel,
        severity: round2(signal.severity),
        confidence: round2(clamp01(existing.confidence + 0.05)),
        repetitionCount: existing.repetitionCount + 1,
        status: "active",
        evidenceRefs: [
          ...signal.evidenceRefs.filter((ref) => !existing.evidenceRefs.includes(ref)),
          ...existing.evidenceRefs,
        ].slice(0, PROBLEM_EVIDENCE_CAP),
        contextKey: signal.contextKey ?? existing.contextKey,
        lastEvidenceTick: input.currentTick,
      });
    }
  }

  // Revision: repeated specific failure under a misread flips the frame to
  // its competing interpretation (the band re-thinks the cause).
  for (const problemId of input.reviseProblemIds ?? []) {
    const frame = byId.get(problemId);
    if (frame !== undefined && frame.misread && frame.competingInterpretation !== undefined) {
      byId.set(problemId, {
        ...frame,
        interpretation: frame.competingInterpretation,
        competingInterpretation: frame.interpretation,
        misread: false,
        status: "revised",
        confidence: round2(clamp01(frame.confidence * 0.7)),
      });
    }
  }

  for (const problemId of input.resolveProblemIds ?? []) {
    const frame = byId.get(problemId);
    if (frame !== undefined) {
      const relievedSeverity = round2(frame.severity * 0.55);
      byId.set(problemId, {
        ...frame,
        severity: relievedSeverity,
        status: relievedSeverity <= PROBLEM_RESOLVED_CONFIDENCE ? "resolved" : "active",
      });
    }
  }

  // Stale framing weakens when lived evidence stops recurring; after two
  // years it becomes dormant and can eventually resolve instead of persisting
  // forever as a UI claim.
  return [...byId.values()]
    .map((frame) => {
      const age = tick - Number(frame.lastEvidenceTick);
      if (age <= 0 || frame.status === "resolved") {
        return frame;
      }
      const severity = round2(clamp01(frame.severity - Math.min(0.5, age * 0.02)));
      if (age >= PROBLEM_DORMANT_AFTER_TICKS * 2 || severity <= 0.08) {
        return { ...frame, severity, status: "resolved" as const };
      }
      if (age >= PROBLEM_DORMANT_AFTER_TICKS) {
        return { ...frame, severity, status: "dormant" as const };
      }
      return { ...frame, severity };
    })
    .sort((left, right) =>
      right.severity - left.severity || left.id.localeCompare(right.id))
    .slice(0, PROBLEM_CAP);
}

// ---------------------------------------------------------------------------
// Idea candidates. The caller (practicalResponses) computes the concrete
// variant options with their fragment basis; this module records the
// considered/selected/rejected/postponed decision with reasons, applying the
// misread bias.
// ---------------------------------------------------------------------------

export interface IdeaOption {
  readonly family: PracticalResponseFamily;
  readonly variantKey: string;
  readonly publicLabel: string;
  readonly mechanismBelief: string;
  readonly basisFragmentIds: readonly string[];
  readonly basisScore: number;
  // Basis floor the variant requires (below = postponed, not rejected).
  readonly basisFloor: number;
  // Relative labor/risk note used in rejection reasons.
  readonly costNote: string;
  readonly source: PracticalIdeaSource;
}

export interface IdeaSelectionResult {
  readonly ideas: readonly PracticalIdeaCandidate[];
  readonly selected?: PracticalIdeaCandidate;
}

/**
 * Rank the options for a problem frame and record the decision. Deterministic:
 * strongest basis wins; a MISREAD frame with ≥2 viable options selects the
 * second-ranked mechanism instead (the band pursues the wrong cause), which
 * earns worse efficacy in context and can later contradict the frame.
 */
export function selectIdeaForProblem(input: {
  readonly frame: PracticalProblemFrame;
  readonly options: readonly IdeaOption[];
  readonly currentTick: TickNumber;
}): IdeaSelectionResult {
  const tick = Number(input.currentTick);
  const viable: IdeaOption[] = [];
  const ideas: PracticalIdeaCandidate[] = [];

  const sorted = [...input.options].sort((left, right) =>
    right.basisScore - left.basisScore || left.variantKey.localeCompare(right.variantKey));

  for (const option of sorted) {
    if (option.basisScore >= option.basisFloor) {
      viable.push(option);
    }
  }

  const selectedIndex = input.frame.misread && viable.length >= 2 ? 1 : 0;

  for (const option of sorted) {
    const viableIndex = viable.indexOf(option);
    const isSelected = viableIndex !== -1 && viableIndex === selectedIndex;
    const status: PracticalIdeaCandidate["status"] = isSelected
      ? "selected"
      : option.basisScore < option.basisFloor
        ? "postponed"
        : "rejected";
    const statusReason = isSelected
      ? input.frame.misread
        ? `chosen under the band's reading "${input.frame.interpretation}" (a stronger option existed)`
        : "strongest practiced basis among the considered options"
      : status === "postponed"
        ? `material/technique basis ${option.basisScore.toFixed(2)} below the ${option.basisFloor.toFixed(2)} this configuration needs`
        : `weaker basis than the chosen option (${option.costNote})`;
    ideas.push({
      id: `idea:${input.frame.id}:${option.family}:${option.variantKey}:${tick}`,
      problemId: input.frame.id,
      family: option.family,
      variantKey: option.variantKey,
      publicLabel: option.publicLabel,
      mechanismBelief: option.mechanismBelief,
      basisFragmentIds: option.basisFragmentIds,
      basisScore: round2(option.basisScore),
      status,
      statusReason,
      source: option.source,
      consideredAtTick: input.currentTick,
    });
  }

  return {
    ideas,
    selected: ideas.find((idea) => idea.status === "selected"),
  };
}

/** Merge this season's idea records into the bounded stored list. */
export function mergeIdeas(
  prior: readonly PracticalIdeaCandidate[],
  fresh: readonly PracticalIdeaCandidate[],
): readonly PracticalIdeaCandidate[] {
  // Newest record per (problem, family, variant); selected/rejected history
  // beyond that is carried by experiments and responses.
  const byKey = new Map<string, PracticalIdeaCandidate>();
  for (const idea of [...fresh, ...prior]) {
    const key = `${idea.problemId}:${idea.family}:${idea.variantKey}`;
    if (!byKey.has(key)) {
      byKey.set(key, idea);
    }
  }
  return [...byKey.values()]
    .sort((left, right) =>
      Number(right.consideredAtTick) - Number(left.consideredAtTick) ||
      left.id.localeCompare(right.id))
    .slice(0, IDEA_CAP);
}

// ---------------------------------------------------------------------------
// Experiments — the selected idea's real bounded test. The forming response
// IS the experiment's practice; efficacy conclusions are written back here.
// ---------------------------------------------------------------------------

export function startExperiment(input: {
  readonly idea: PracticalIdeaCandidate;
  readonly responseId: string;
  readonly expectedEffect: string;
  readonly materials: readonly string[];
  readonly procedure: string;
  readonly laborCost: number;
  readonly riskCost: number;
  readonly opportunityCost: string;
  readonly observationBasis: "direct" | "inferred";
  readonly contextKey?: string;
  readonly currentTick: TickNumber;
}): PracticalExperiment {
  return {
    id: `experiment:${input.responseId}`,
    problemId: input.idea.problemId,
    ideaId: input.idea.id,
    responseId: input.responseId,
    family: input.idea.family,
    variantKey: input.idea.variantKey,
    expectedEffect: input.expectedEffect,
    materials: input.materials,
    procedure: input.procedure,
    laborCost: round2(clamp01(input.laborCost)),
    riskCost: round2(clamp01(input.riskCost)),
    opportunityCost: input.opportunityCost,
    observationBasis: input.observationBasis,
    attemptSeasons: 0,
    status: "underway",
    contextKey: input.contextKey,
    fragmentsLearned: [],
    fragmentsContradicted: [],
    startedAtTick: input.currentTick,
  };
}

export interface ExperimentAdvanceEvent {
  readonly responseId: string;
  readonly attempted: boolean;
  readonly conclusion?: "success" | "partial" | "failure" | "abandoned";
  readonly observedOutcome?: string;
  readonly fragmentsLearned?: readonly string[];
  readonly fragmentsContradicted?: readonly string[];
}

export function advanceExperiments(
  prior: readonly PracticalExperiment[],
  events: readonly ExperimentAdvanceEvent[],
  started: readonly PracticalExperiment[],
  currentTick: TickNumber,
): readonly PracticalExperiment[] {
  const eventByResponse = new Map(events.map((event) => [event.responseId, event]));
  const advanced = prior.map((experiment) => {
    const event = eventByResponse.get(experiment.responseId);
    if (event === undefined || experiment.status !== "underway") {
      return experiment;
    }
    const attemptSeasons = experiment.attemptSeasons + (event.attempted ? 1 : 0);
    if (event.conclusion === undefined) {
      return { ...experiment, attemptSeasons };
    }
    const status: PracticalExperiment["status"] =
      event.conclusion === "success" ? "concluded_success" :
      event.conclusion === "partial" ? "concluded_partial" :
      event.conclusion === "failure" ? "concluded_failure" :
      "abandoned";
    return {
      ...experiment,
      attemptSeasons,
      status,
      observedOutcome: event.observedOutcome ?? experiment.observedOutcome,
      fragmentsLearned: [...new Set([...experiment.fragmentsLearned, ...(event.fragmentsLearned ?? [])])].slice(0, 4),
      fragmentsContradicted: [...new Set([...experiment.fragmentsContradicted, ...(event.fragmentsContradicted ?? [])])].slice(0, 4),
      concludedAtTick: currentTick,
    };
  });

  return [...started, ...advanced]
    .sort((left, right) => {
      const rank = (experiment: PracticalExperiment): number =>
        experiment.status === "underway" ? 2 : 1;
      return rank(right) - rank(left) ||
        Number(right.startedAtTick) - Number(left.startedAtTick) ||
        left.id.localeCompare(right.id);
    })
    .slice(0, EXPERIMENT_CAP);
}

// ---------------------------------------------------------------------------
// Daughter inheritance: at most ONE active problem frame travels as an
// inherited framing (weakened, re-provable); ideas and experiments reset —
// a daughter re-considers and re-tests with its own hands.
// ---------------------------------------------------------------------------

export function inheritProblemFramesForDaughter(
  parentFrames: readonly PracticalProblemFrame[],
  daughterBandId: string,
  currentTick: TickNumber,
): readonly PracticalProblemFrame[] {
  const strongest = [...parentFrames]
    .filter((frame) => frame.status === "active" && frame.severity >= 0.4)
    .sort((left, right) => right.severity - left.severity || left.id.localeCompare(right.id))[0];
  if (strongest === undefined) {
    return [];
  }
  return [{
    ...strongest,
    id: problemFrameId(daughterBandId, strongest.family),
    origin: "inherited",
    confidence: round2(clamp01(strongest.confidence * 0.6)),
    repetitionCount: 1,
    evidenceRefs: ["inherited:parent_band"],
    framedAtTick: currentTick,
    lastEvidenceTick: currentTick,
  }];
}
