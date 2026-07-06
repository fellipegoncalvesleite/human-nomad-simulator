import { useMemo } from "react";

import {
  candidateFamilyLabel,
  deriveProblemPracticeProfile,
  practiceExperimentStatusLabel,
  practiceFeedbackTypeLabel,
  problemFrameFamilyLabel,
  type PracticeExperimentCandidate,
  type PracticeExperimentFamily,
  type ProblemFrame,
  type ProblemFrameFamily,
  type ProblemPracticeEvidenceRef,
} from "../../sim/agents/problemPractice";
import type { Band } from "../../sim/agents/types";
import type { WorldState } from "../../sim/world/types";

import { Icon, type IconName } from "../icons";
import { Chip, SectionHeading } from "./parts";

const PROBLEM_ICON: Readonly<Record<ProblemFrameFamily, IconName>> = {
  food_return_subsistence: "food",
  carrying_logistical_burden: "storage",
  crossing_blocked_path: "ford",
  route_new_country_uncertainty: "route",
  camp_setup_care_burden: "camp",
  water_refuge_pressure: "water",
  social_contact_uncertainty: "talk",
};

const CANDIDATE_ICON: Readonly<Record<PracticeExperimentFamily, IconName>> = {
  carrying_container_cordage: "storage",
  food_processing_trial: "food",
  crossing_route_trial: "ford",
  camp_shelter_care_trial: "camp",
  fire_hearth_fuel_trial: "settle",
  water_edge_capture_trial: "fishing",
  tool_digging_cutting_trial: "craft",
};

export function ProblemsAndTrials({
  band,
  world,
}: {
  readonly band: Band;
  readonly world: WorldState | null;
}) {
  const profile = useMemo(
    () => (world === null ? undefined : deriveProblemPracticeProfile(world, band)),
    [band, world],
  );

  if (profile === undefined) {
    return (
      <section className="bp-section band-problems-trials">
        <SectionHeading icon="focus">Problems &amp; Trials</SectionHeading>
        <p className="condition-note">World detail is unavailable for the selected band.</p>
      </section>
    );
  }

  const visibleFrames = [...profile.problemFrames]
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, 5);
  const visibleCandidates = [...profile.practiceCandidates]
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, 5);

  return (
    <section className="bp-section band-problems-trials" aria-label="problems and trial candidates">
      <SectionHeading icon="focus">Problems &amp; Trials</SectionHeading>
      <p className="condition-note">
        How the band seems to frame pressure, and what practical trials look plausible from its known world. These are not skills.
      </p>

      <article className="problem-practice-overview">
        <span className="problem-practice-kicker">Problem framing</span>
        <h3>{profile.overviewTitle}</h3>
        {profile.overviewLines.map((line) => (
          <p key={line}>{line}</p>
        ))}
        <div className="problem-practice-overview-counts">
          <span>{profile.problemFrames.length} framed pressure{profile.problemFrames.length === 1 ? "" : "s"}</span>
          <span>{profile.practiceCandidates.length} trial candidate{profile.practiceCandidates.length === 1 ? "" : "s"}</span>
          <span>{profile.uncertaintyMisreadCount} uncertainty line{profile.uncertaintyMisreadCount === 1 ? "" : "s"}</span>
          <span>{profile.lowFeedbackRiskCount + profile.deadEndRiskCount} low-feedback or dead-end risk</span>
        </div>
      </article>

      <div className="problem-practice-note" role="note">
        <Icon name="warning" size={14} />
        <span>Repetition can build familiarity or reinforce a dead end. No method is reliable yet.</span>
      </div>

      <div className="problem-practice-block">
        <span className="problem-practice-block-title">What they think the hard part is</span>
        {visibleFrames.length === 0 ? (
          <p className="empty-panel">No bounded problem frame is visible yet.</p>
        ) : (
          <div className="problem-frame-grid">
            {visibleFrames.map((frame) => (
              <ProblemFrameCard key={frame.id} frame={frame} />
            ))}
          </div>
        )}
      </div>

      <div className="problem-practice-block">
        <span className="problem-practice-block-title">What they could try</span>
        {visibleCandidates.length === 0 ? (
          <p className="empty-panel">No trial candidate is grounded yet.</p>
        ) : (
          <div className="practice-candidate-grid">
            {visibleCandidates.map((candidate) => {
              const frame = profile.problemFrames.find((entry) => entry.id === candidate.problemFrameId);
              return <PracticeCandidateCard key={candidate.id} candidate={candidate} problemLabel={frame?.publicLabel ?? "framed pressure"} />;
            })}
          </div>
        )}
      </div>

      {profile.inheritedBasisCount === 0 ? null : (
        <div className="problem-practice-note inherited" role="note">
          <Icon name="lineage" size={14} />
          <span>Some evidence is inherited. A daughter band may carry a warning or idea that it has not tested in this country.</span>
        </div>
      )}
    </section>
  );
}

function ProblemFrameCard({ frame }: { readonly frame: ProblemFrame }) {
  return (
    <details className="problem-frame-card">
      <summary>
        <span className="problem-frame-icon">
          <Icon name={PROBLEM_ICON[frame.family]} />
        </span>
        <span className="problem-frame-head">
          <span className="problem-practice-card-kicker">{problemFrameFamilyLabel(frame.family)}</span>
          <span className="problem-frame-title">{frame.publicLabel}</span>
          <span className="problem-frame-summary">{frame.meaning}</span>
          <span className="problem-evidence-preview" aria-label="top problem evidence">
            {frame.evidence.slice(0, 2).map((entry, index) => (
              <EvidenceChip key={`${frame.id}:preview:${entry.label}:${index}`} evidence={entry} compact />
            ))}
          </span>
        </span>
        <span className="problem-frame-chips">
          <Chip>{Math.round(frame.confidence * 100)}%</Chip>
          <Chip>{basisLabel(frame.livedBasis)}</Chip>
        </span>
      </summary>
      <div className="problem-frame-body">
        <p><strong>They may see it as:</strong> {frame.perceivedCause}.</p>
        <p><strong>Uncertainty:</strong> {frame.uncertainty}</p>
        <p><strong>Possible misread:</strong> {frame.possibleMisread}</p>
        <BasisLine title="Evidence" items={frame.objectiveBasis} empty="evidence remains thin" />
        <div className="problem-link-counts">
          {frame.relatedAffordanceIds.length === 0 ? null : <span>affordance basis</span>}
          {frame.relatedKnowledgeIds.length === 0 ? null : <span>knowledge basis</span>}
          {frame.relatedEventIds.length === 0 ? null : <span>event basis</span>}
          {frame.relatedActivityIds.length === 0 ? null : <span>activity basis</span>}
          {frame.relatedRepetitionIds.length === 0 ? null : <span>repetition basis</span>}
        </div>
      </div>
    </details>
  );
}

function PracticeCandidateCard({
  candidate,
  problemLabel,
}: {
  readonly candidate: PracticeExperimentCandidate;
  readonly problemLabel: string;
}) {
  return (
    <details className={`practice-candidate-card status-${candidate.status}`}>
      <summary>
        <span className="practice-candidate-icon">
          <Icon name={CANDIDATE_ICON[candidate.family]} />
        </span>
        <span className="practice-candidate-head">
          <span className="problem-practice-card-kicker">{candidateFamilyLabel(candidate.family)}</span>
          <span className="practice-candidate-title">{candidate.publicLabel}</span>
          <span className="practice-candidate-summary">{candidate.meaning}</span>
          <span className="problem-evidence-preview" aria-label="top trial evidence">
            {candidate.evidence.slice(0, 2).map((entry, index) => (
              <EvidenceChip key={`${candidate.id}:preview:${entry.label}:${index}`} evidence={entry} compact />
            ))}
          </span>
        </span>
        <span className="practice-candidate-chips">
          <Chip>{practiceExperimentStatusLabel(candidate.status)}</Chip>
          <Chip>not a skill yet</Chip>
        </span>
      </summary>
      <div className="practice-candidate-body">
        <p><strong>Responds to:</strong> {problemLabel}</p>
        <BasisLine title="Material basis" items={candidate.materialBasis} empty="material basis weak" />
        <BasisLine title="Knowledge basis" items={candidate.knowledgeBasis} empty="knowledge basis weak" />
        <BasisLine title="Activity and repetition" items={candidate.activityRepetitionBasis} empty="activity basis weak" />
        <div className="problem-practice-meta-row">
          <span>{practiceFeedbackTypeLabel(candidate.expectedFeedbackType)}</span>
          <span>{candidate.laborBurden}</span>
        </div>
        <p className="practice-risk-note">{candidate.likelyCostRisk}</p>
        <p className="practice-risk-note">{candidate.uncertainty}</p>
        <div className="problem-link-counts">
          {candidate.deadEndRisk === "low" ? null : <span>dead-end risk</span>}
          {candidate.falseConfidenceRisk === "low" ? null : <span>false confidence</span>}
          {candidate.lowFeedbackRisk === "low" ? null : <span>low feedback</span>}
          {candidate.localOnlyRisk === "low" ? null : <span>local only</span>}
        </div>
      </div>
    </details>
  );
}

function EvidenceChip({
  evidence,
  compact,
}: {
  readonly evidence: ProblemPracticeEvidenceRef;
  readonly compact?: boolean;
}) {
  return (
    <span className={compact === true ? "problem-evidence-chip compact" : "problem-evidence-chip"} title={evidence.label}>
      <Icon name={iconForEvidence(evidence.kind)} size={12} />
      <span>{evidence.label}</span>
    </span>
  );
}

function BasisLine({
  title,
  items,
  empty,
}: {
  readonly title: string;
  readonly items: readonly string[];
  readonly empty: string;
}) {
  return (
    <div className="problem-practice-basis">
      <span className="problem-practice-basis-title">{title}</span>
      <div className="problem-practice-chip-list">
        {(items.length === 0 ? [empty] : items).map((item) => (
          <span key={`${title}:${item}`} className={items.length === 0 ? "problem-missing-chip" : "problem-evidence-chip"}>
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

function basisLabel(basis: ProblemFrame["livedBasis"]): string {
  switch (basis) {
    case "lived":
      return "lived";
    case "inherited_not_lived":
      return "inherited";
    case "mixed":
      return "mixed";
    case "unknown":
      return "uncertain";
  }
}

function iconForEvidence(kind: ProblemPracticeEvidenceRef["kind"]): IconName {
  switch (kind) {
    case "event":
      return "time";
    case "knowledge":
      return "knowledge";
    case "activity":
      return "activity";
    case "memory":
      return "memory";
    case "demography":
      return "people";
    case "seasonal_support":
      return "season";
    case "repetition":
      return "return";
    case "contact":
      return "talk";
    case "identity":
      return "focus";
    case "affordance":
      return "craft";
  }
}
