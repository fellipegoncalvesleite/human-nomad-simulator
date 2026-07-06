import { useMemo } from "react";

import {
  derivePracticeFeedbackReadinessProfile,
  practiceFeedbackQualityLabel,
  practiceFeedbackReadinessFamilyLabel,
  practiceFeedbackReadinessFeedbackTypeLabel,
  practiceFeedbackReadinessStatusLabel,
  type PracticeFeedbackEvidenceRef,
  type PracticeFeedbackReadinessFamily,
  type PracticeFeedbackReadinessItem,
} from "../../sim/agents/practiceFeedbackReadiness";
import type { Band } from "../../sim/agents/types";
import type { WorldState } from "../../sim/world/types";

import { Icon, type IconName } from "../icons";
import { Chip, SectionHeading } from "./parts";

const FAMILY_ICON: Readonly<Record<PracticeFeedbackReadinessFamily, IconName>> = {
  carrying_fiber_handling: "storage",
  food_work_processing: "food",
  route_crossing: "ford",
  camp_setup_care: "camp",
  fire_hearth_fuel: "settle",
  water_edge_capture: "fishing",
  tool_digging_cutting: "craft",
};

export function PracticeFeedback({
  band,
  world,
}: {
  readonly band: Band;
  readonly world: WorldState | null;
}) {
  const profile = useMemo(
    () => (world === null ? undefined : derivePracticeFeedbackReadinessProfile(world, band)),
    [band, world],
  );

  if (profile === undefined) {
    return (
      <section className="bp-section band-practice-feedback">
        <SectionHeading icon="activity">Practice Feedback</SectionHeading>
        <p className="condition-note">World detail is unavailable for the selected band.</p>
      </section>
    );
  }

  const repeatedTrials = profile.items
    .filter((item) => item.repeatedExposureBasis.length > 0 || item.linkedRepetitionIds.length > 0)
    .slice(0, 5);
  const learningReady = profile.items
    .filter((item) => item.readinessStatus === "learning_ready_later")
    .slice(0, 4);
  const weakOrDeadEnd = profile.items
    .filter((item) =>
      item.readinessStatus === "repeated_low_feedback" ||
      item.readinessStatus === "dead_end_risk" ||
      item.readinessStatus === "false_confidence_risk" ||
      item.risks.includes("low_feedback") ||
      item.risks.includes("dead_end") ||
      item.risks.includes("false_confidence"))
    .slice(0, 4);
  const inherited = profile.items
    .filter((item) => item.readinessStatus === "inherited_not_tested_here" || item.inheritedVsLivedBasis === "inherited_not_lived")
    .slice(0, 3);

  return (
    <section className="bp-section band-practice-feedback" aria-label="practice feedback and routine readiness">
      <SectionHeading icon="activity">Practice Feedback</SectionHeading>
      <p className="condition-note">
        Repeated trial candidates and the feedback they seem to produce. Learning-ready later is not a skill.
      </p>

      <article className="practice-feedback-overview">
        <span className="practice-feedback-kicker">Routine readiness</span>
        <h3>{profile.overviewTitle}</h3>
        {profile.overviewLines.map((line) => (
          <p key={line}>{line}</p>
        ))}
        <div className="practice-feedback-overview-counts">
          <span>{profile.items.length} readiness item{profile.items.length === 1 ? "" : "s"}</span>
          <span>{profile.repeatedExposureCount} repeated exposure signal{profile.repeatedExposureCount === 1 ? "" : "s"}</span>
          <span>{profile.lowFeedbackRiskCount + profile.deadEndRiskCount} weak or dead-end risk</span>
          <span>{profile.footholdRefCount} camp/foothold ref{profile.footholdRefCount === 1 ? "" : "s"}</span>
        </div>
      </article>

      <div className="practice-feedback-note" role="note">
        <Icon name="warning" size={14} />
        <span>Repetition can clarify feedback or reinforce a bad routine. No method, adaptation, or extra effect exists here.</span>
      </div>

      <FeedbackBlock title="Repeated trials" empty="No repeated candidate is visible yet." items={repeatedTrials} />
      <FeedbackBlock title="Learning-ready later" empty="No candidate has both repetition and useful feedback yet." items={learningReady} ready />
      <FeedbackBlock title="Dead ends and weak feedback" empty="No weak-feedback or dead-end signal is currently prominent." items={weakOrDeadEnd} />

      {inherited.length === 0 ? null : (
        <div className="practice-feedback-block">
          <span className="practice-feedback-block-title">Inherited but untested</span>
          <div className="practice-feedback-grid compact">
            {inherited.map((item) => (
              <FeedbackCard key={item.id} item={item} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function FeedbackBlock({
  title,
  empty,
  items,
  ready = false,
}: {
  readonly title: string;
  readonly empty: string;
  readonly items: readonly PracticeFeedbackReadinessItem[];
  readonly ready?: boolean;
}) {
  return (
    <div className="practice-feedback-block">
      <span className="practice-feedback-block-title">{title}</span>
      {items.length === 0 ? (
        <p className="empty-panel">{empty}</p>
      ) : (
        <>
          {ready ? (
            <p className="practice-feedback-subnote">These are future learning candidates only. They are not reliable methods.</p>
          ) : null}
          <div className="practice-feedback-grid">
            {items.map((item) => (
              <FeedbackCard key={item.id} item={item} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function FeedbackCard({ item }: { readonly item: PracticeFeedbackReadinessItem }) {
  return (
    <details className={`practice-feedback-card status-${item.readinessStatus}`}>
      <summary>
        <span className="practice-feedback-card-icon">
          <Icon name={FAMILY_ICON[item.family]} />
        </span>
        <span className="practice-feedback-card-head">
          <span className="practice-feedback-card-kicker">{practiceFeedbackReadinessFamilyLabel(item.family)}</span>
          <span className="practice-feedback-card-title">{item.publicLabel}</span>
          <span className="practice-feedback-card-summary">{item.meaning}</span>
          <span className="practice-feedback-evidence-preview" aria-label="top feedback evidence">
            {item.evidence.slice(0, 2).map((entry, index) => (
              <EvidenceChip key={`${item.id}:preview:${entry.label}:${index}`} evidence={entry} />
            ))}
          </span>
        </span>
        <span className="practice-feedback-card-chips">
          <Chip>{practiceFeedbackReadinessStatusLabel(item.readinessStatus)}</Chip>
          <Chip>{practiceFeedbackReadinessFeedbackTypeLabel(item.feedbackType)}</Chip>
          <Chip>{Math.round(item.confidence * 100)}%</Chip>
        </span>
      </summary>
      <div className="practice-feedback-card-body">
        <p><strong>Feedback quality:</strong> {practiceFeedbackQualityLabel(item.feedbackQuality)}</p>
        <p><strong>Familiarity:</strong> {item.familiaritySignal}</p>
        <p><strong>Transfer clue:</strong> {item.localTransferClue}</p>
        <ChipLine title="Repeated basis" items={item.repeatedExposureBasis} empty="no repeated basis is clear" />
        <ChipLine title="Blockers" items={item.blockers.map((entry) => entry.replace(/_/g, " "))} empty="no major blocker shown" />
        <ChipLine title="Risks" items={item.risks.map((entry) => entry.replace(/_/g, " "))} empty="no major risk shown" />
        <EvidenceLine evidence={item.evidence} />
        <div className="practice-feedback-card-note">No skill or adaptation exists yet.</div>
      </div>
    </details>
  );
}

function EvidenceChip({
  evidence,
}: {
  readonly evidence: PracticeFeedbackEvidenceRef;
}) {
  return (
    <span className={`practice-feedback-evidence-chip source-${evidence.sourceSystem}`}>
      {sourceLabel(evidence)}
    </span>
  );
}

function EvidenceLine({ evidence }: { readonly evidence: readonly PracticeFeedbackEvidenceRef[] }) {
  if (evidence.length === 0) {
    return <p className="practice-feedback-evidence-line">Evidence remains thin.</p>;
  }

  return (
    <div className="practice-feedback-evidence-line">
      {evidence.map((entry, index) => (
        <span key={`${entry.label}:${index}`}>{sourceLabel(entry)}</span>
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

function sourceLabel(evidence: PracticeFeedbackEvidenceRef): string {
  switch (evidence.sourceSystem) {
    case "problem_practice":
      return evidence.kind === "problem_frame" ? "problem frame" : "trial candidate";
    case "material_affordance":
      return "material basis";
    case "repetition_familiarity":
      return "repetition";
    case "knowledge_ecology":
      return "knowledge";
    case "canonical_event":
      return "event";
    case "activity_party":
      return "activity";
    case "camp_foothold":
    case "foothold_storage":
    case "foothold_fire":
    case "foothold_care":
      return "camp foothold";
    case "place_memory":
      return "place memory";
    case "route_memory":
      return "route memory";
    case "crossing_memory":
      return "crossing memory";
    case "demography":
      return "labor";
    case "band_identity":
      return "identity context";
  }
}
