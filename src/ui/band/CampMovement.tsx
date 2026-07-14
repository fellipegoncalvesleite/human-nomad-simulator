import { useMemo } from "react";
import type { ReactNode } from "react";

import { deriveCampMovementProfile } from "../../sim/agents/campMovement";
import {
  derivePublicHumanStoryProfile,
  publicStoryForSource,
  type PublicHumanStoryProfile,
  type PublicStoryItem,
} from "../../sim/agents/publicHumanStory";
import type {
  CampMovementEvidenceRef,
  LocalCampShiftRecord,
  NewPlaceEstablishmentState,
  OldCampAnchorDecayRecord,
  PressureReliefCandidate,
  StagnationEscapeRecord,
  TemporaryTaskCampRecord,
} from "../../sim/agents/types";
import type { Band } from "../../sim/agents/types";
import type { WorldState } from "../../sim/world/types";
import { Icon } from "../icons";
import { Chip, SectionHeading } from "./parts";

export function CampMovement({
  band,
  world,
}: {
  readonly band: Band;
  readonly world: WorldState | null;
}) {
  const profile = useMemo(
    () => (world === null ? undefined : deriveCampMovementProfile(world, band)),
    [band, world],
  );
  const storyProfile = useMemo(
    () => (world === null ? undefined : derivePublicHumanStoryProfile(world, band)),
    [band, world],
  );

  if (profile === undefined) {
    return (
      <section className="bp-section band-camp-movement">
        <SectionHeading icon="move">Movement &amp; Camp</SectionHeading>
        <p className="condition-note">World detail is unavailable for the selected band.</p>
      </section>
    );
  }

  return (
    <section className="bp-section band-camp-movement" aria-label="camp movement and establishment">
      <SectionHeading icon="move">Movement &amp; Camp</SectionHeading>
      <p className="condition-note">
        Nearby shifts, temporary task camps, recovery, and new-place familiarity. These are practical movements, not settlements.
      </p>

      <article className="practice-feedback-overview camp-movement-overview">
        <span className="practice-feedback-kicker">Camp situation</span>
        <h3>{profile.overviewTitle}</h3>
        {profile.overviewLines.map((line) => (
          <p key={line}>{line}</p>
        ))}
        <div className="practice-feedback-overview-counts">
          <span>{profile.localCampShiftCount} local shift{profile.localCampShiftCount === 1 ? "" : "s"}</span>
          <span>{profile.temporaryCampCount} temporary camp{profile.temporaryCampCount === 1 ? "" : "s"}</span>
          <span>{profile.stagnationEscapeResponseCount} escape response{profile.stagnationEscapeResponseCount === 1 ? "" : "s"}</span>
          <span>{profile.oldCampDecayCount} old-camp decay cue{profile.oldCampDecayCount === 1 ? "" : "s"}</span>
        </div>
      </article>

      <div className="practice-feedback-note" role="note">
        <Icon name="warning" size={14} />
        <span>Camp shifts can fail, repeat, or only help briefly. Establishment is local familiarity, not a permanent place.</span>
      </div>

      <StoryBlock title="Movement stories" empty="No grounded movement story is visible yet." stories={[
        ...(storyProfile?.campStories.slice(0, 2) ?? []),
        ...(storyProfile?.rangeRotationStories.slice(0, 2) ?? []),
      ]} />

      <CurrentEstablishment
        establishment={profile.currentEstablishment}
        story={profile.currentEstablishment === undefined || storyProfile === undefined ? undefined : publicStoryForSource(storyProfile, profile.currentEstablishment.id, "camp_story")}
      />

      <RecordBlock title="Range rotation / pressure relief" empty="No pressure-relief candidate is visible yet.">
        {profile.rangeRotation.chosenCandidate === undefined ? null : (
          <PressureReliefCard
            candidate={profile.rangeRotation.chosenCandidate}
            chosen
            story={storyProfile === undefined ? undefined : publicStoryForSource(storyProfile, profile.rangeRotation.chosenCandidate.id, "range_rotation_story")}
          />
        )}
        {profile.rangeRotation.candidates
          .filter((candidate) => candidate.id !== profile.rangeRotation.chosenCandidate?.id)
          .slice(0, 3)
          .map((candidate) => (
            <PressureReliefCard
              key={candidate.id}
              candidate={candidate}
              chosen={false}
              story={storyProfile === undefined ? undefined : publicStoryForSource(storyProfile, candidate.id, "range_rotation_story")}
            />
          ))}
      </RecordBlock>

      <RecordBlock title="Local shifts and temporary camps" empty="No recent local shift or task camp is stored yet.">
        {profile.recentLocalShifts.slice(0, 4).map((shift) => (
          <LocalShiftCard
            key={shift.id}
            shift={shift}
            story={storyProfile === undefined ? undefined : publicStoryForSource(storyProfile, shift.id, "camp_story")}
          />
        ))}
        {profile.temporaryTaskCamps.slice(0, 4).map((camp) => (
          <TemporaryCampCard
            key={camp.id}
            camp={camp}
            story={storyProfile === undefined ? undefined : publicStoryForSource(storyProfile, camp.id, "camp_story")}
          />
        ))}
      </RecordBlock>

      <RecordBlock title="Stagnation escape" empty="No stagnation escape response is prominent.">
        {profile.stagnationEscapes.slice(0, 5).map((escape) => (
          <EscapeCard
            key={escape.id}
            escape={escape}
            story={storyProfile === undefined ? undefined : publicStoryForSource(storyProfile, escape.id, "camp_story")}
          />
        ))}
      </RecordBlock>

      <RecordBlock title="Old camp pull" empty="Old camp pull has not visibly weakened.">
        {profile.oldCampDecay.slice(0, 4).map((decay) => (
          <OldCampDecayCard
            key={decay.id}
            decay={decay}
            story={storyProfile === undefined ? undefined : publicStoryForSource(storyProfile, decay.id, "camp_story")}
          />
        ))}
      </RecordBlock>

      {profile.passiveCollapseAudit === undefined || profile.passiveCollapseAudit.status === "not_under_collapse_pressure" ? null : (
        <div className={`practice-feedback-note status-${profile.passiveCollapseAudit.status}`} role="note">
          <Icon name="risk" size={14} />
          <span>
            Collapse pressure is visible: {profile.passiveCollapseAudit.status.replace(/_/g, " ")}.
            {profile.passiveCollapseAudit.blockedReasons.length === 0 ? "" : ` Blocked by ${profile.passiveCollapseAudit.blockedReasons.join("; ")}.`}
          </span>
        </div>
      )}
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
  const uniqueStories = [...new Map(stories.map((story) => [story.id, story])).values()].slice(0, 4);
  return (
    <div className="practice-feedback-block public-story-block">
      <span className="practice-feedback-block-title">{title}</span>
      {uniqueStories.length === 0 ? (
        <p className="empty-panel">{empty}</p>
      ) : (
        <div className="practice-feedback-grid compact">
          {uniqueStories.map((story) => (
            <article key={story.id} className={`practice-feedback-card human-story-card tone-${story.toneTier}`}>
              <div className="practice-feedback-card-body">
                <div className="adaptive-attempt-head">
                  <Icon name={story.category === "range_rotation_story" ? "move" : "camp"} />
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

function CurrentEstablishment({
  establishment,
  story,
}: {
  readonly establishment: NewPlaceEstablishmentState | undefined;
  readonly story?: PublicStoryItem;
}) {
  return (
    <div className="practice-feedback-block">
      <span className="practice-feedback-block-title">Current camp situation</span>
      {establishment === undefined ? (
        <p className="empty-panel">No establishment marker is visible yet.</p>
      ) : (
        <article className={`practice-feedback-card status-${establishment.status}`}>
          <div className="practice-feedback-card-body">
            <div className="adaptive-attempt-head">
              <Icon name={establishment.status === "failing" ? "warning" : "camp"} />
              <strong className="public-story-title">{story?.title ?? `${sentence(establishment.status)} place`}</strong>
            </div>
            <p className="public-story-line">
              {story?.story ?? "They are trying to make this camp place familiar without turning it into a permanent home."}
            </p>
            <p className="practice-feedback-card-note">
              {establishment.sameClusterShift
                ? "This shift stayed in the same local camp cluster, so some familiarity carried over."
                : establishment.resetReason === undefined
                  ? "This is continued local use of the same place."
                  : `Establishment reset because of ${establishment.resetReason}.`}
            </p>
            <ChipLine title="What helps" items={establishment.knownBasis} empty="little helps yet" />
            <ChipLine title="What blocks it" items={establishment.blockedReasons} empty="no major blocker stored" />
            <EvidenceLine evidence={establishment.evidenceRefs} />
            <p className="practice-feedback-card-note">This is a local establishment marker, not a lasting home place.</p>
          </div>
        </article>
      )}
    </div>
  );
}

function RecordBlock({
  title,
  empty,
  children,
}: {
  readonly title: string;
  readonly empty: string;
  readonly children: ReactNode;
}) {
  const items = Array.isArray(children) ? children.filter(Boolean) : children;
  const isEmpty = Array.isArray(items) ? items.length === 0 : items === null || items === undefined;

  return (
    <div className="practice-feedback-block">
      <span className="practice-feedback-block-title">{title}</span>
      {isEmpty ? <p className="empty-panel">{empty}</p> : <div className="practice-feedback-grid compact">{items}</div>}
    </div>
  );
}

function LocalShiftCard({ shift, story }: { readonly shift: LocalCampShiftRecord; readonly story?: PublicStoryItem }) {
  return (
    <article className={`practice-feedback-card outcome-${shift.outcome}`}>
      <div className="practice-feedback-card-body">
        <div className="adaptive-attempt-head">
          <Icon name="move" />
          <strong className="public-story-title">{story?.title ?? "Nearby camp shift"}</strong>
        </div>
        <p className="public-story-line">{story?.story ?? `${shift.reason}. Outcome: ${sentence(shift.outcome)}.`}</p>
        <div className="practice-feedback-card-chips">
          <Chip>{shift.distance <= 2 ? "local shift" : "larger move"}</Chip>
          <Chip>{story?.status ?? sentence(shift.outcome)}</Chip>
        </div>
        <EvidenceLine evidence={shift.evidenceRefs} />
      </div>
    </article>
  );
}

function PressureReliefCard({
  candidate,
  chosen,
  story,
}: {
  readonly candidate: PressureReliefCandidate;
  readonly chosen: boolean;
  readonly story?: PublicStoryItem;
}) {
  return (
    <article className={`practice-feedback-card status-${candidate.status}`}>
      <div className="practice-feedback-card-body">
        <div className="adaptive-attempt-head">
          <Icon name={chosen ? "move" : candidate.actionStrategy === "scout_probe" ? "scout" : "warning"} />
          <strong className="public-story-title">{story?.title ?? (chosen ? "Chosen relief place" : sentence(candidate.status))}</strong>
        </div>
        <p className="public-story-line">
          {story?.story ?? `${candidate.reasonLabel}. It is ${candidate.betterThanCurrent ? "also somewhat better" : "good enough rather than richer"}.`}
        </p>
        <div className="practice-feedback-card-chips">
          <Chip>{candidate.sameRiverCountry ? "river country kept" : "familiar country"}</Chip>
          <Chip>{story?.status ?? "relief candidate"}</Chip>
          {story?.evidenceChips.slice(0, 1).map((chip) => <Chip key={`${candidate.id}:${chip}`}>{chip}</Chip>)}
        </div>
        {candidate.blockedReason === undefined ? null : (
          <p className="practice-feedback-card-note">Blocked: {candidate.blockedReason}.</p>
        )}
        <EvidenceLine evidence={candidate.evidenceRefs} />
      </div>
    </article>
  );
}

function TemporaryCampCard({ camp, story }: { readonly camp: TemporaryTaskCampRecord; readonly story?: PublicStoryItem }) {
  return (
    <article className={`practice-feedback-card status-${camp.status}`}>
      <div className="practice-feedback-card-body">
        <div className="adaptive-attempt-head">
          <Icon name="scout" />
          <strong className="public-story-title">{story?.title ?? "Temporary task camp"}</strong>
        </div>
        <p className="public-story-line">{story?.story ?? `${sentence(camp.purpose)} is ${camp.status.replace(/_/g, " ")}. It is short-lived and carries no store.`}</p>
        <div className="practice-feedback-card-chips">
          <Chip>temporary</Chip>
          <Chip>{story?.status ?? camp.status.replace(/_/g, " ")}</Chip>
        </div>
        <EvidenceLine evidence={camp.evidenceRefs} />
      </div>
    </article>
  );
}

function EscapeCard({ escape, story }: { readonly escape: StagnationEscapeRecord; readonly story?: PublicStoryItem }) {
  return (
    <article className={`practice-feedback-card status-${escape.status}`}>
      <div className="practice-feedback-card-body">
        <div className="adaptive-attempt-head">
          <Icon name={escape.status === "blocked" ? "warning" : "return"} />
          <strong className="public-story-title">{story?.title ?? sentence(escape.response)}</strong>
        </div>
        <p className="public-story-line">{story?.story ?? `${escape.reason}. Status: ${escape.status.replace(/_/g, " ")}.`}</p>
        <ChipLine title="Blocked by" items={escape.blockedReasons} empty="not blocked in the stored trace" />
        <EvidenceLine evidence={escape.evidenceRefs} />
      </div>
    </article>
  );
}

function OldCampDecayCard({ decay, story }: { readonly decay: OldCampAnchorDecayRecord; readonly story?: PublicStoryItem }) {
  return (
    <article className="practice-feedback-card">
      <div className="practice-feedback-card-body">
        <div className="adaptive-attempt-head">
          <Icon name="return" />
          <strong className="public-story-title">{story?.title ?? "Old camp pull weakening"}</strong>
        </div>
        <p className="public-story-line">{story?.story ?? `${decay.reason}. The old place pulls less strongly now.`}</p>
        <p className="practice-feedback-card-note">This fades gradually and can recover if later evidence supports the old place.</p>
      </div>
    </article>
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
      <span className="practice-feedback-chip-list">
        {items.length === 0 ? <Chip>{empty}</Chip> : items.slice(0, 4).map((item) => <Chip key={item}>{item}</Chip>)}
      </span>
    </div>
  );
}

function EvidenceLine({ evidence }: { readonly evidence: readonly CampMovementEvidenceRef[] }) {
  return (
    <div className="practice-feedback-evidence-line" aria-label="evidence">
      {evidence.length === 0 ? (
        <span>Evidence is weak.</span>
      ) : (
        evidence.slice(0, 4).map((entry, index) => (
          <span key={`${entry.sourceSystem}:${entry.label}:${index}`} className="practice-feedback-evidence-chip">
            {entry.label} · {campEvidenceSourceLabel(entry.sourceSystem)}
          </span>
        ))
      )}
    </div>
  );
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function sentence(value: string): string {
  const spaced = value.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function campEvidenceSourceLabel(source: CampMovementEvidenceRef["sourceSystem"]): string {
  switch (source) {
    case "adaptive_human": return "camp idea";
    case "camp_foothold": return "camp trace";
    case "activity": return "working party";
    case "place_memory": return "place memory";
    case "movement": return "move memory";
    case "event": return "remembered event";
    case "demography": return "camp labor";
    case "pressure": return "felt pressure";
    case "route_crossing": return "route or crossing";
  }
}
