import { useMemo } from "react";

import {
  adaptiveAttemptOutcomeLabel,
  adaptiveIdeaFamilyLabel,
  adaptiveResponseTypeLabel,
  deriveAdaptiveHumanProfile,
} from "../../sim/agents/adaptiveHuman";
import {
  derivePublicHumanStoryProfile,
  publicStoryForSource,
  type PublicHumanStoryProfile,
  type PublicStoryItem,
} from "../../sim/agents/publicHumanStory";
import type {
  AdaptiveEvidenceRef,
  AdaptiveIdea,
  ContextBoundAdaptation,
  LocalRoutine,
  SolutionAttempt,
} from "../../sim/agents/types";
import type { Band } from "../../sim/agents/types";
import type { WorldState } from "../../sim/world/types";
import { Icon, type IconName } from "../icons";
import { Chip, SectionHeading } from "./parts";

const FAMILY_ICON: Readonly<Record<AdaptiveIdea["family"], IconName>> = {
  carrying_logistics: "storage",
  food_work: "food",
  route_crossing: "route",
  camp_care: "camp",
  fire_fuel: "settle",
  water_edge: "water",
  social_copy: "talk",
};

export function IdeasSolutions({
  band,
  world,
}: {
  readonly band: Band;
  readonly world: WorldState | null;
}) {
  const profile = useMemo(
    () => (world === null ? undefined : deriveAdaptiveHumanProfile(world, band)),
    [band, world],
  );
  const storyProfile = useMemo(
    () => (world === null ? undefined : derivePublicHumanStoryProfile(world, band)),
    [band, world],
  );

  if (band.practicalAdaptation !== undefined) {
    return <CanonicalInventionChain band={band} />;
  }

  if (profile === undefined) {
    return (
      <section className="bp-section band-adaptive">
        <SectionHeading icon="activity">Ideas & Solutions</SectionHeading>
        <p className="condition-note">World detail is unavailable for the selected band.</p>
      </section>
    );
  }

  const chosenOrConsidered = profile.ideas
    .filter((idea) => idea.status === "chosen" || idea.status === "considered" || idea.status === "desperate")
    .slice(0, 5);
  const rejected = profile.ideas
    .filter((idea) => idea.status === "rejected" || idea.status === "blocked")
    .slice(0, 4);
  const deadEnds = profile.attempts
    .filter((attempt) =>
      attempt.outcome === "dead_end" ||
      attempt.outcome === "false_confidence" ||
      attempt.outcome === "clear_failure" ||
      attempt.outcome === "blocked_before_attempt" ||
      attempt.outcome === "too_labor_heavy")
    .slice(0, 4);

  return (
    <section className="bp-section band-adaptive" aria-label="adaptive ideas solutions and local routines">
      <SectionHeading icon="activity">Ideas & Solutions</SectionHeading>
      <p className="condition-note">
        Active responses, attempts, and local routines. Repeated success can become locally useful, but no global method is created.
      </p>

      <article className="practice-feedback-overview adaptive-overview">
        <span className="practice-feedback-kicker">Camp problem-solving</span>
        <h3>{profile.overviewTitle}</h3>
        {profile.overviewLines.map((line) => (
          <p key={line}>{line}</p>
        ))}
        <div className="practice-feedback-overview-counts">
          <span>{profile.ideas.length} idea{profile.ideas.length === 1 ? "" : "s"}</span>
          <span>{profile.selectedResponses.length} selected response{profile.selectedResponses.length === 1 ? "" : "s"}</span>
          <span>{profile.attempts.length} attempt{profile.attempts.length === 1 ? "" : "s"}</span>
          <span>{profile.localRoutines.length} local routine{profile.localRoutines.length === 1 ? "" : "s"}</span>
        </div>
      </article>

      <div className="practice-feedback-note" role="note">
        <Icon name="warning" size={14} />
        <span>Ideas can be wrong, copied only partly, blocked by labor, or useful only in this place.</span>
      </div>

      <StoryBlock title="Camp talk" empty="No grounded camp argument is visible yet." stories={storyProfile?.internalTalks.slice(0, 3) ?? []} />

      <IdeaBlock title="Ideas being considered" empty="No grounded idea is visible yet." ideas={chosenOrConsidered} storyProfile={storyProfile} />
      <AttemptBlock title="Tried solutions" empty="No recent solution attempt is stored yet." attempts={profile.attempts.slice(0, 6)} storyProfile={storyProfile} />
      <RoutineBlock title="Local routines" empty="No routine has repeated useful feedback yet." routines={profile.localRoutines} storyProfile={storyProfile} />

      {profile.contextBoundAdaptations.length === 0 ? null : (
        <AdaptationBlock adaptations={profile.contextBoundAdaptations} />
      )}

      <AttemptBlock title="Dead ends and blocked attempts" empty="No blocked or dead-end attempt is prominent." attempts={deadEnds} compact storyProfile={storyProfile} />
      <IdeaBlock title="Rejected or blocked ideas" empty="No rejected idea is retained in the current trace." ideas={rejected} compact storyProfile={storyProfile} />
    </section>
  );
}

function CanonicalInventionChain({ band }: { readonly band: Band }) {
  const state = band.practicalAdaptation;
  if (state === undefined) return null;
  const problems = (state.problems ?? []).slice(0, 5);
  const ideas = (state.ideas ?? []).slice(0, 6);
  const experiments = (state.experiments ?? []).slice(0, 4);
  const responses = state.responses.slice(0, 6);
  return (
    <section className="bp-section band-adaptive" aria-label="causal invention chain">
      <SectionHeading icon="activity">Problems, ideas &amp; inventions</SectionHeading>
      <p className="condition-note">One causal record: lived evidence → competing idea → physical test → learning → context-bound response.</p>
      {problems.length === 0 ? <p className="empty-panel">No grounded practical problem is active yet.</p> : (
        <div className="practice-feedback-grid compact">
          {problems.map((problem) => (
            <details key={problem.id} className={`practice-feedback-card status-${problem.status}`}>
              <summary><strong>{problem.publicLabel}</strong><Chip>{problem.status}</Chip></summary>
              <div className="practice-feedback-card-body">
                <p><strong>Reading:</strong> {problem.interpretation}{problem.misread ? " (possibly wrong)" : ""}</p>
                <p><strong>Evidence:</strong> {problem.evidenceRefs.join(", ")}</p>
                <p>Severity {Math.round(problem.severity * 100)}% · repeated {problem.repetitionCount} time(s) · uncertainty {Math.round((1 - problem.confidence) * 100)}%</p>
              </div>
            </details>
          ))}
        </div>
      )}
      <div className="practice-feedback-grid compact">
        {ideas.map((idea) => (
          <details key={idea.id} className={`practice-feedback-card status-${idea.status}`}>
            <summary><strong>{idea.publicLabel}</strong><Chip>{idea.status}</Chip></summary>
            <div className="practice-feedback-card-body">
              <p><strong>Believed mechanism:</strong> {idea.mechanismBelief}</p>
              <p><strong>Decision:</strong> {idea.statusReason}</p>
              <p><strong>Basis:</strong> {idea.basisFragmentIds.join(", ") || "missing components"}</p>
            </div>
          </details>
        ))}
      </div>
      <div className="practice-feedback-grid compact">
        {experiments.map((experiment) => (
          <details key={experiment.id} className={`practice-feedback-card status-${experiment.status}`}>
            <summary><strong>{experiment.family.replace(/_/g, " ")}: {experiment.variantKey.replace(/_/g, " ")}</strong><Chip>{experiment.status.replace(/_/g, " ")}</Chip></summary>
            <div className="practice-feedback-card-body">
              <p><strong>Materials:</strong> {experiment.materials.join(", ")}</p>
              <p><strong>Procedure:</strong> {experiment.procedure}</p>
              <p><strong>Expected:</strong> {experiment.expectedEffect}</p>
              <p><strong>Observed:</strong> {experiment.observedOutcome ?? "not attempted yet"}</p>
              <p><strong>Cost:</strong> labor {Math.round(experiment.laborCost * 100)}%, risk {Math.round(experiment.riskCost * 100)}%; {experiment.opportunityCost}</p>
            </div>
          </details>
        ))}
      </div>
      <div className="practice-feedback-grid compact">
        {responses.map((response) => (
          <article key={response.id} className={`practice-feedback-card status-${response.status}`}>
            <div className="practice-feedback-card-body">
              <strong>{response.publicLabel}</strong>
              <p>{response.contextNote}</p>
              <p>{response.status} · confidence {Math.round(response.confidence * 100)}% · {response.successCount} useful / {response.failureCount} failed</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function StoryBlock({
  title,
  empty,
  stories,
}: {
  readonly title: string;
  readonly empty: string;
  readonly stories: readonly PublicStoryItem[];
}) {
  return (
    <div className="practice-feedback-block adaptive-block public-story-block">
      <span className="practice-feedback-block-title">{title}</span>
      {stories.length === 0 ? (
        <p className="empty-panel">{empty}</p>
      ) : (
        <div className="practice-feedback-grid compact">
          {stories.map((story) => (
            <article key={story.id} className={`practice-feedback-card human-story-card tone-${story.toneTier}`}>
              <div className="practice-feedback-card-body">
                <div className="adaptive-attempt-head">
                  <Icon name={story.toneTier === "colorful" || story.toneTier === "rare_odd" ? "talk" : "people"} />
                  <strong className="public-story-title">{story.title}</strong>
                </div>
                <p className="public-story-line">{story.story}</p>
                <div className="practice-feedback-card-chips">
                  <Chip>{story.status}</Chip>
                  {story.evidenceChips.slice(0, 2).map((chip) => <Chip key={`${story.id}:${chip}`}>{chip}</Chip>)}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function IdeaBlock({
  title,
  empty,
  ideas,
  compact = false,
  storyProfile,
}: {
  readonly title: string;
  readonly empty: string;
  readonly ideas: readonly AdaptiveIdea[];
  readonly compact?: boolean;
  readonly storyProfile?: PublicHumanStoryProfile;
}) {
  return (
    <div className="practice-feedback-block adaptive-block">
      <span className="practice-feedback-block-title">{title}</span>
      {ideas.length === 0 ? (
        <p className="empty-panel">{empty}</p>
      ) : (
        <div className={`practice-feedback-grid${compact ? " compact" : ""}`}>
          {ideas.map((idea) => (
            <IdeaCard key={idea.id} idea={idea} story={storyProfile === undefined ? undefined : publicStoryForSource(storyProfile, idea.id, "idea_story")} />
          ))}
        </div>
      )}
    </div>
  );
}

function IdeaCard({ idea, story }: { readonly idea: AdaptiveIdea; readonly story?: PublicStoryItem }) {
  return (
    <details className={`practice-feedback-card adaptive-card status-${idea.status}`}>
      <summary>
        <span className="practice-feedback-card-icon">
          <Icon name={FAMILY_ICON[idea.family]} />
        </span>
        <span className="practice-feedback-card-head">
          <span className="practice-feedback-card-kicker">{adaptiveIdeaFamilyLabel(idea.family)}</span>
          <span className="practice-feedback-card-title public-story-title">{story?.title ?? idea.publicLabel}</span>
          <span className="practice-feedback-card-summary public-story-line">{story?.story ?? idea.meaning}</span>
          <span className="practice-feedback-evidence-preview">
            {idea.evidence.slice(0, 2).map((entry, index) => (
              <EvidenceChip key={`${idea.id}:e:${index}`} evidence={entry} />
            ))}
          </span>
        </span>
        <span className="practice-feedback-card-chips">
          <Chip>{story?.status ?? idea.status.replace(/_/g, " ")}</Chip>
          <Chip>{adaptiveResponseTypeLabel(idea.proposedResponse)}</Chip>
          {story?.evidenceChips.slice(0, 1).map((chip) => <Chip key={`${idea.id}:${chip}`}>{chip}</Chip>)}
        </span>
      </summary>
      <div className="practice-feedback-card-body">
        <p><strong>What they hope:</strong> {idea.expectedBenefit}</p>
        <p><strong>What could go wrong:</strong> {idea.expectedCost}; {idea.risk}</p>
        <p><strong>What they still do not know:</strong> {idea.uncertainty}</p>
        {idea.rejectionReason === undefined ? null : <p><strong>Why not chosen:</strong> {idea.rejectionReason}</p>}
        <ChipLine title="Objects involved" items={story?.concreteObjectNames.length === 0 ? idea.materialBasis : story?.concreteObjectNames ?? idea.materialBasis} empty="no clear object" />
        <ChipLine title="What they know" items={[...idea.knowledgeBasis, ...idea.activityBasis]} empty="little known yet" />
        <ChipLine title="Camp and other-band clues" items={[...idea.campFootholdBasis, idea.socialSource].filter((item): item is string => item !== undefined)} empty="no camp or outside clue" />
        <EvidenceLine evidence={idea.evidence} />
        <div className="practice-feedback-card-note">Not global; not reliable everywhere.</div>
      </div>
    </details>
  );
}

function AttemptBlock({
  title,
  empty,
  attempts,
  compact = false,
  storyProfile,
}: {
  readonly title: string;
  readonly empty: string;
  readonly attempts: readonly SolutionAttempt[];
  readonly compact?: boolean;
  readonly storyProfile?: PublicHumanStoryProfile;
}) {
  return (
    <div className="practice-feedback-block adaptive-block">
      <span className="practice-feedback-block-title">{title}</span>
      {attempts.length === 0 ? (
        <p className="empty-panel">{empty}</p>
      ) : (
        <div className={`practice-feedback-grid${compact ? " compact" : ""}`}>
          {attempts.map((attempt) => (
            <AttemptCard key={attempt.id} attempt={attempt} story={storyProfile === undefined ? undefined : publicStoryForSource(storyProfile, attempt.id, "attempt_story")} />
          ))}
        </div>
      )}
    </div>
  );
}

function AttemptCard({ attempt, story }: { readonly attempt: SolutionAttempt; readonly story?: PublicStoryItem }) {
  return (
    <article className={`practice-feedback-card adaptive-attempt outcome-${attempt.outcome}`}>
      <div className="practice-feedback-card-body">
        <div className="adaptive-attempt-head">
          <Icon name={attempt.participants === "whole_band" ? "people" : "activity"} />
          <strong className="public-story-title">{story?.title ?? adaptiveResponseTypeLabel(attempt.attemptType)}</strong>
        </div>
        <p className="public-story-line">{story?.story ?? `${adaptiveAttemptOutcomeLabel(attempt.outcome)} after the attempt.`}</p>
        <div className="practice-feedback-chip-line">
          <span className="practice-feedback-basis-title">Group</span>
          <span className="practice-feedback-chip-list">
            <Chip>{attempt.participants.replace(/_/g, " ")}</Chip>
            <Chip>{attempt.participantEstimate} people</Chip>
          </span>
        </div>
        <div className="practice-feedback-chip-line">
          <span className="practice-feedback-basis-title">Cost and risk</span>
          <span className="practice-feedback-chip-list">
            <Chip>{attempt.costPaid}</Chip>
            <Chip>{attempt.riskRealized}</Chip>
          </span>
        </div>
        {attempt.blockedReason === undefined ? null : <p><strong>Blocked:</strong> {attempt.blockedReason}</p>}
        <p className="practice-feedback-card-note">
          {attempt.helpedEscapeOrSurvive ? "This helped here, but it still belongs to this place and season." : "This did not prove a dependable way forward."}
        </p>
      </div>
    </article>
  );
}

function RoutineBlock({
  title,
  empty,
  routines,
  storyProfile,
}: {
  readonly title: string;
  readonly empty: string;
  readonly routines: readonly LocalRoutine[];
  readonly storyProfile?: PublicHumanStoryProfile;
}) {
  return (
    <div className="practice-feedback-block adaptive-block">
      <span className="practice-feedback-block-title">{title}</span>
      {routines.length === 0 ? (
        <p className="empty-panel">{empty}</p>
      ) : (
        <div className="practice-feedback-grid">
          {routines.map((routine) => (
            <RoutineCard key={routine.id} routine={routine} story={storyProfile === undefined ? undefined : publicStoryForSource(storyProfile, routine.id, "routine_story")} />
          ))}
        </div>
      )}
    </div>
  );
}

function RoutineCard({ routine, story }: { readonly routine: LocalRoutine; readonly story?: PublicStoryItem }) {
  return (
    <article className={`practice-feedback-card adaptive-routine confidence-${routine.confidenceBand}`}>
      <div className="practice-feedback-card-body">
        <div className="adaptive-attempt-head">
          <Icon name={FAMILY_ICON[routine.domain]} />
          <strong className="public-story-title">{story?.title ?? routine.publicLabel}</strong>
        </div>
        <p className="public-story-line">{story?.story ?? routine.contextWhereItWorks}</p>
        <p><strong>Where it fails:</strong> {routine.contextWhereItFails}</p>
        <div className="practice-feedback-chip-line">
          <span className="practice-feedback-basis-title">Feedback</span>
          <span className="practice-feedback-chip-list">
            <Chip>{routine.confidenceBand.replace(/_/g, " ")}</Chip>
            <Chip>{routine.successfulFeedbackCount} useful</Chip>
            <Chip>{routine.failureCount} failed</Chip>
          </span>
        </div>
        <p className="practice-feedback-card-note">Local habit, not a universal method. It travels poorly when place, season, or people change.</p>
      </div>
    </article>
  );
}

function AdaptationBlock({ adaptations }: { readonly adaptations: readonly ContextBoundAdaptation[] }) {
  return (
    <div className="practice-feedback-block adaptive-block">
      <span className="practice-feedback-block-title">Context-bound practices</span>
      <p className="practice-feedback-subnote">These appear only after repeated local success and can still fail outside their context.</p>
      <div className="practice-feedback-grid">
        {adaptations.map((adaptation) => (
          <article key={adaptation.id} className="practice-feedback-card adaptive-adaptation">
            <div className="practice-feedback-card-body">
              <strong>{adaptation.publicLabel}</strong>
              <p>{adaptation.limitations.join(" ")}</p>
        <ChipLine title="Where it breaks" items={adaptation.failureConditions} empty="limits not clear" />
              <p className="practice-feedback-card-note">Band-local and context-bound.</p>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function EvidenceChip({ evidence }: { readonly evidence: AdaptiveEvidenceRef }) {
  return (
    <span className={`practice-feedback-evidence-chip source-${evidence.sourceSystem}`}>
      {sourceLabel(evidence)}
    </span>
  );
}

function EvidenceLine({ evidence }: { readonly evidence: readonly AdaptiveEvidenceRef[] }) {
  if (evidence.length === 0) {
    return <p className="practice-feedback-evidence-line">Evidence remains thin.</p>;
  }

  return (
    <div className="practice-feedback-evidence-line">
      {evidence.map((entry, index) => (
        <span key={`${entry.sourceId}:${index}`}>{sourceLabel(entry)}</span>
      ))}
    </div>
  );
}

function ChipLine({
  title,
  items,
  empty,
}: {
  readonly title: string;
  readonly items: readonly string[];
  readonly empty: string;
}) {
  return (
    <div className="practice-feedback-chip-line">
      <span className="practice-feedback-basis-title">{title}</span>
      {items.length === 0 ? (
        <span className="practice-feedback-muted">{empty}</span>
      ) : (
        <span className="practice-feedback-chip-list">
          {items.slice(0, 4).map((item) => (
            <Chip key={item}>{item}</Chip>
          ))}
        </span>
      )}
    </div>
  );
}

function sourceLabel(evidence: AdaptiveEvidenceRef): string {
  switch (evidence.sourceSystem) {
    case "problem_practice": return evidence.kind === "problem" ? "problem" : "trial";
    case "practice_feedback": return "past try";
    case "material_affordance": return "object clue";
    case "knowledge_ecology": return "known place";
    case "social_diffusion": return "other-band hint";
    case "camp_foothold": return "camp";
    case "activity_party": return "activity";
    case "repetition_familiarity": return "repetition";
    case "movement_memory": return "movement";
    case "route_memory": return "route";
    case "crossing_memory": return "crossing";
    case "place_memory": return "place";
    case "demography": return "labor";
    case "pressure_state": return "felt pressure";
    case "decision": return "chosen response";
  }
}
