import { useMemo } from "react";

import {
  deriveSocialEcologicalDiffusionProfile,
  socialDiffusionChannelLabel,
  socialDiffusionCompatibilityLabel,
  socialDiffusionDomainLabel,
  socialDiffusionStatusLabel,
  socialDiffusionTacitDifficultyLabel,
  socialDiffusionTrustFilterLabel,
  type SocialDiffusionDomain,
  type SocialDiffusionEvidenceRef,
  type SocialDiffusionItem,
  type SocialEcologicalContext,
} from "../../sim/agents/socialEcologicalDiffusion";
import {
  derivePublicHumanStoryProfile,
  publicStoryForSource,
  type PublicHumanStoryProfile,
  type PublicStoryItem,
} from "../../sim/agents/publicHumanStory";
import type { Band } from "../../sim/agents/types";
import type { WorldState } from "../../sim/world/types";

import { Icon, type IconName } from "../icons";
import { Chip, SectionHeading } from "./parts";

const DOMAIN_ICON: Readonly<Record<SocialDiffusionDomain, IconName>> = {
  route_crossing: "route",
  food_work: "food",
  camp_foothold_care: "camp",
  material_affordance: "craft",
  fire_hearth_fuel: "settle",
  water_edge: "water",
  social_contact: "people",
};

export function BetweenBands({
  band,
  world,
}: {
  readonly band: Band;
  readonly world: WorldState | null;
}) {
  const profile = useMemo(
    () => (world === null ? undefined : deriveSocialEcologicalDiffusionProfile(world, band)),
    [band, world],
  );
  const storyProfile = useMemo(
    () => (world === null ? undefined : derivePublicHumanStoryProfile(world, band)),
    [band, world],
  );

  if (profile === undefined) {
    return (
      <section className="bp-section band-between-bands">
        <SectionHeading icon="people">Between Bands</SectionHeading>
        <p className="condition-note">World detail is unavailable for the selected band.</p>
      </section>
    );
  }

  const reachesThem = profile.diffusionItems
    .filter((item) =>
      item.visibility === "heard" ||
      item.visibility === "inherited" ||
      item.channel === "direct_contact" ||
      item.channel === "activity_talk" ||
      item.channel === "parent_daughter")
    .slice(0, 5);
  const visibleNotKnown = profile.diffusionItems
    .filter((item) =>
      item.status === "seen_not_understood" ||
      item.status === "visible_trace_only" ||
      item.risks.includes("missing_tacit_steps") ||
      item.tacitDifficulty === "high")
    .slice(0, 4);
  const sharedCountry = profile.socialContexts
    .filter((item) => item.kind === "shared_route_water_country")
    .slice(0, 4);
  const caution = profile.diffusionItems
    .filter((item) =>
      item.status === "withheld_or_not_shared" ||
      item.status === "rejected_as_untrusted" ||
      item.trustFilter === "cautious_hearsay" ||
      item.trustFilter === "tense_contact" ||
      item.trustFilter === "avoids_source")
    .slice(0, 4);
  const inherited = profile.diffusionItems
    .filter((item) => item.channel === "parent_daughter" || item.inheritedVsLocalBasis === "inherited")
    .slice(0, 3);

  return (
    <section className="bp-section band-between-bands" aria-label="social ecological knowledge between bands">
      <SectionHeading icon="people">Between Bands</SectionHeading>
      <p className="condition-note">
        What reaches this band through contact, traces, shared country, and inherited memory. It is exposure, not shared culture or reliable method.
      </p>

      <article className="between-bands-overview">
        <span className="between-bands-kicker">Outer talk</span>
        <h3>{profile.overviewTitle}</h3>
        {profile.overviewLines.map((line) => (
          <p key={line}>{line}</p>
        ))}
        <div className="between-bands-overview-counts">
          <span>{profile.socialContexts.length} context signal{profile.socialContexts.length === 1 ? "" : "s"}</span>
          <span>{profile.diffusionItems.length} outside clue{profile.diffusionItems.length === 1 ? "" : "s"}</span>
          <span>{profile.failedImitationCount} incomplete copy risk{profile.failedImitationCount === 1 ? "" : "s"}</span>
          <span>{profile.sharedRouteWaterRefCount} shared water or route clue{profile.sharedRouteWaterRefCount === 1 ? "" : "s"}</span>
        </div>
      </article>

      <div className="between-bands-note" role="note">
        <Icon name="warning" size={14} />
        <span>Seeing, hearing, or inheriting a hint does not reveal hidden bands, full intentions, or tacit practice steps.</span>
      </div>

      <StoryBlock title="Outer talks" empty="No grounded outer-band talk is visible yet." stories={storyProfile?.outerTalks.slice(0, 4) ?? []} />

      <DiffusionBlock title="What reaches them from others" empty="No heard, inherited, or contact-carried clue is visible yet." items={reachesThem} storyProfile={storyProfile} />
      <DiffusionBlock title="What they can see but not fully know" empty="No visible trace or incomplete-copy clue is prominent yet." items={visibleNotKnown} storyProfile={storyProfile} />
      <ContextBlock title="Shared country and shared routes" empty="No shared route, water, or country context is grounded yet." contexts={sharedCountry} storyProfile={storyProfile} />
      <DiffusionBlock title="What they may not share or trust" empty="No caution, rejection, or possible withholding signal is prominent yet." items={caution} storyProfile={storyProfile} />

      {inherited.length === 0 ? null : (
        <DiffusionBlock title="Daughter / parent memory" empty="No inherited outside memory is visible." items={inherited} storyProfile={storyProfile} />
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
  return (
    <div className="between-bands-block public-story-block">
      <span className="between-bands-block-title">{title}</span>
      {stories.length === 0 ? (
        <p className="empty-panel">{empty}</p>
      ) : (
        <div className="between-bands-grid">
          {stories.map((story) => (
            <article key={story.id} className={`between-bands-card human-story-card tone-${story.toneTier}`}>
              <div className="between-bands-card-body">
                <div className="adaptive-attempt-head">
                  <Icon name={story.status === "tense" ? "warning" : "talk"} />
                  <strong className="public-story-title">{story.title}</strong>
                </div>
                <p className="public-story-line">{story.story}</p>
                <div className="between-bands-card-chips">
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

function DiffusionBlock({
  title,
  empty,
  items,
  storyProfile,
}: {
  readonly title: string;
  readonly empty: string;
  readonly items: readonly SocialDiffusionItem[];
  readonly storyProfile?: PublicHumanStoryProfile;
}) {
  return (
    <div className="between-bands-block">
      <span className="between-bands-block-title">{title}</span>
      {items.length === 0 ? (
        <p className="empty-panel">{empty}</p>
      ) : (
        <div className="between-bands-grid">
          {items.map((item) => (
            <DiffusionCard key={item.id} item={item} story={storyProfile === undefined ? undefined : publicStoryForSource(storyProfile, item.id, "outer_talk")} />
          ))}
        </div>
      )}
    </div>
  );
}

function ContextBlock({
  title,
  empty,
  contexts,
  storyProfile,
}: {
  readonly title: string;
  readonly empty: string;
  readonly contexts: readonly SocialEcologicalContext[];
  readonly storyProfile?: PublicHumanStoryProfile;
}) {
  return (
    <div className="between-bands-block">
      <span className="between-bands-block-title">{title}</span>
      {contexts.length === 0 ? (
        <p className="empty-panel">{empty}</p>
      ) : (
        <div className="between-bands-context-grid">
          {contexts.map((context) => {
            const story = storyProfile === undefined ? undefined : publicStoryForSource(storyProfile, context.id, "outer_talk");
            return (
              <details key={context.id} className={`between-bands-context kind-${context.kind}`}>
                <summary>
                  <span className="between-bands-card-icon"><Icon name="range" /></span>
                  <span className="between-bands-card-head">
                    <span className="between-bands-card-kicker">{socialDiffusionChannelLabel(context.channel)}</span>
                    <span className="between-bands-card-title public-story-title">{story?.title ?? context.publicLabel}</span>
                    <span className="between-bands-card-summary public-story-line">{story?.story ?? context.meaning}</span>
                  </span>
                  <span className="between-bands-card-chips">
                    <Chip>{socialDiffusionTrustFilterLabel(context.trustFilter)}</Chip>
                  </span>
                </summary>
                <div className="between-bands-card-body">
                  <p><strong>What they can see:</strong> {context.sharedContextLine}</p>
                  <p><strong>How fresh it feels:</strong> {context.recencyLine}</p>
                  <EvidenceLine evidence={context.evidence} />
                  <div className="between-bands-card-note">This is not access, borders, or territory.</div>
                </div>
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DiffusionCard({ item, story }: { readonly item: SocialDiffusionItem; readonly story?: PublicStoryItem }) {
  return (
    <details className={`between-bands-card status-${item.status}`}>
      <summary>
        <span className="between-bands-card-icon">
          <Icon name={DOMAIN_ICON[item.domain]} />
        </span>
        <span className="between-bands-card-head">
          <span className="between-bands-card-kicker">{socialDiffusionDomainLabel(item.domain)}</span>
          <span className="between-bands-card-title public-story-title">{story?.title ?? item.publicLabel}</span>
          <span className="between-bands-card-summary public-story-line">{story?.story ?? item.meaning}</span>
          <span className="between-bands-evidence-preview" aria-label="top social knowledge evidence">
            {item.evidence.slice(0, 2).map((entry, index) => (
              <EvidenceChip key={`${item.id}:preview:${entry.label}:${index}`} evidence={entry} />
            ))}
          </span>
        </span>
        <span className="between-bands-card-chips">
          <Chip>{socialDiffusionStatusLabel(item.status)}</Chip>
          <Chip>{socialDiffusionChannelLabel(item.channel)}</Chip>
          {story?.evidenceChips.slice(0, 1).map((chip) => <Chip key={`${item.id}:${chip}`}>{chip}</Chip>)}
        </span>
      </summary>
      <div className="between-bands-card-body">
        <p><strong>Where the clue came from:</strong> {item.sourceLabel}</p>
        <p><strong>What is hard to copy:</strong> {socialDiffusionTacitDifficultyLabel(item.tacitDifficulty)}</p>
        <p><strong>Fit here:</strong> {socialDiffusionCompatibilityLabel(item.compatibility)}</p>
        <p><strong>Trust:</strong> {socialDiffusionTrustFilterLabel(item.trustFilter)}</p>
        <ChipLine title="What could go wrong" items={item.risks.map((risk) => risk.replace(/_/g, " "))} empty="no major risk shown" />
        <EvidenceLine evidence={item.evidence} />
        <div className="between-bands-card-note">Not a learned skill; no automatic improvement or decision effect.</div>
      </div>
    </details>
  );
}

function EvidenceChip({ evidence }: { readonly evidence: SocialDiffusionEvidenceRef }) {
  return (
    <span className={`between-bands-evidence-chip source-${evidence.sourceSystem}`}>
      {sourceLabel(evidence)}
    </span>
  );
}

function EvidenceLine({ evidence }: { readonly evidence: readonly SocialDiffusionEvidenceRef[] }) {
  if (evidence.length === 0) {
    return <p className="between-bands-evidence-line">Evidence remains thin.</p>;
  }

  return (
    <div className="between-bands-evidence-line">
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
    <div className="between-bands-chip-line">
      <span className="between-bands-basis-title">{title}</span>
      {items.length === 0 ? (
        <span className="between-bands-muted">{empty}</span>
      ) : (
        <span className="between-bands-chip-list">
          {items.slice(0, 4).map((item) => (
            <Chip key={item}>{item}</Chip>
          ))}
        </span>
      )}
    </div>
  );
}

function sourceLabel(evidence: SocialDiffusionEvidenceRef): string {
  switch (evidence.sourceSystem) {
    case "contact_memory":
      return "contact memory";
    case "reported_knowledge":
      return "heard report";
    case "social_range_recognition":
      return "shared-country cue";
    case "familiar_country":
      return "familiar country";
    case "activity_party":
      return "returning party";
    case "camp_foothold":
      return "camp trace";
    case "practice_feedback":
      return "practice feedback";
    case "problem_practice":
      return "problem trial";
    case "material_affordance":
      return "object clue";
    case "knowledge_ecology":
      return "known place";
    case "canonical_event":
      return "event";
    case "route_memory":
      return "route memory";
    case "crossing_memory":
      return "crossing memory";
    case "place_memory":
      return "place memory";
    case "fission_inheritance":
      return "parent memory";
    case "band_identity":
      return "identity context";
  }
}
