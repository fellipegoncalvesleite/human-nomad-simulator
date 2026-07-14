import { useMemo } from "react";

import {
  deriveKnowledgeEcologyProfile,
  type KnowledgeCarrierCategory,
  type KnowledgeConfidenceBand,
  type KnowledgeEcologyDomain,
  type KnowledgeEcologyItem,
  type KnowledgeEvidenceKind,
  type KnowledgePracticalStatus,
} from "../../sim/agents/knowledgeEcology";
import { deriveBandChronicle } from "../../sim/agents/bandChronicle";
import type { Band } from "../../sim/agents/types";
import type { WorldState } from "../../sim/world/types";

import { Icon, type IconName } from "../icons";
import { KnowledgeCarriers } from "./KnowledgeCarriers";
import { Chip, SectionHeading } from "./parts";

const DOMAIN_ICON: Readonly<Record<KnowledgeEcologyDomain, IconName>> = {
  route_corridor: "route",
  crossing: "ford",
  place_country: "range",
  food_work: "food",
  water_refuge: "water",
  risk_caution: "warning",
  social_contact: "talk",
  inherited_memory: "lineage",
};

export function Knowledge({
  band,
  world,
  onOpenChronicle,
  onOpenEvents,
}: {
  readonly band: Band;
  readonly world: WorldState | null;
  readonly onOpenChronicle?: (pageId: string) => void;
  readonly onOpenEvents?: () => void;
}) {
  const profile = useMemo(
    () => (world === null ? undefined : deriveKnowledgeEcologyProfile(world, band)),
    [band, world],
  );
  const chroniclePageIds = useMemo(() => {
    if (world === null) {
      return new Set<string>();
    }
    return new Set(deriveBandChronicle(world, band).pages.map((page) => page.id));
  }, [band, world]);

  if (profile === undefined) {
    return (
      <section className="bp-section band-knowledge">
        <SectionHeading icon="knowledge">Knowledge</SectionHeading>
        <p className="condition-note">World detail is unavailable for the selected band.</p>
      </section>
    );
  }

  return (
    <section className="bp-section band-knowledge" aria-label="knowledge ecology">
      <SectionHeading icon="knowledge">Knowledge</SectionHeading>
      <p className="condition-note">
        What the band knows, who carries it, and whether it comes from practice, returning parties, older memory, or inheritance.
      </p>

      <article className="knowledge-overview">
        <span className="knowledge-kicker">Learning record</span>
        <h3>{profile.overviewTitle}</h3>
        {profile.overviewLines.map((line) => (
          <p key={line}>{line}</p>
        ))}
        <div className="knowledge-overview-counts">
          <span>{profile.items.length} item{profile.items.length === 1 ? "" : "s"}</span>
          <span>{profile.practicalItemCount} practical</span>
          <span>{profile.inheritedItemCount} inherited</span>
          <span>{profile.fadingItemCount} fading</span>
        </div>
      </article>

      <KnowledgeCarriers band={band} world={world} />

      {profile.items.length === 0 ? (
        <p className="empty-panel">No bounded knowledge profile is visible yet.</p>
      ) : (
        <div className="knowledge-card-grid">
          {profile.items.map((item) => (
            <KnowledgeCard
              key={item.id}
              item={item}
              chroniclePageIds={chroniclePageIds}
              onOpenChronicle={onOpenChronicle}
              onOpenEvents={onOpenEvents}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function KnowledgeCard({
  item,
  chroniclePageIds,
  onOpenChronicle,
  onOpenEvents,
}: {
  readonly item: KnowledgeEcologyItem;
  readonly chroniclePageIds: ReadonlySet<string>;
  readonly onOpenChronicle?: (pageId: string) => void;
  readonly onOpenEvents?: () => void;
}) {
  const chronicleTarget = item.relatedChronicleLinkIds.find((pageId) => chroniclePageIds.has(pageId));

  return (
    <details className={`knowledge-card confidence-${item.confidenceBand}`}>
      <summary>
        <span className="knowledge-card-icon">
          <Icon name={DOMAIN_ICON[item.domain]} />
        </span>
        <span className="knowledge-card-head">
          <span className="knowledge-card-kicker">{domainLabel(item.domain)}</span>
          <span className="knowledge-card-title">{item.title}</span>
          <span className="knowledge-card-summary">{item.summary}</span>
          <span className="knowledge-card-evidence-preview" aria-label="top knowledge evidence">
            {item.evidence.slice(0, 2).map((entry, index) => (
              <span
                key={`${item.id}:preview:${entry.kind}:${entry.label}:${index}`}
                className="knowledge-evidence-chip compact"
                title={entry.label}
              >
                <Icon name={iconForEvidence(entry.kind)} size={12} />
                <span>{entry.label}</span>
              </span>
            ))}
          </span>
        </span>
        <span className="knowledge-card-chips">
          <Chip>{confidenceLabel(item.confidenceBand)}</Chip>
          <Chip>{practicalLabel(item.practicalStatus)}</Chip>
        </span>
      </summary>
      <div className="knowledge-card-body">
        {item.uncertainty === undefined ? null : <p className="knowledge-uncertainty">{item.uncertainty}</p>}
        <div className="knowledge-meta-row">
          <span>{carrierLabel(item.carrier)}</span>
          <span>{transmissionLabel(item.transmission)}</span>
          {item.livedStatus === "inherited_not_personally_lived" ? <span>not personally lived</span> : null}
          {item.fading ? <span>needs reinforcement</span> : null}
        </div>
        <div className="knowledge-evidence-list" aria-label="knowledge evidence">
          {item.evidence.map((entry, index) => (
            <span
              key={`${item.id}:${entry.kind}:${entry.label}:${index}`}
              className="knowledge-evidence-chip"
              title={entry.label}
            >
              <Icon name={iconForEvidence(entry.kind)} size={13} />
              <span>{entry.label}</span>
            </span>
          ))}
        </div>
        <div className="knowledge-link-row">
          {item.relatedEventIds.length === 0 || onOpenEvents === undefined ? null : (
            <button type="button" className="chronicle-link small" onClick={onOpenEvents}>
              <Icon name="time" />
              <span>See events behind this</span>
            </button>
          )}
          {chronicleTarget === undefined || onOpenChronicle === undefined ? null : (
            <button type="button" className="chronicle-link small" onClick={() => onOpenChronicle(chronicleTarget)}>
              <Icon name="knowledge" />
              <span>Open Chronicle passage</span>
            </button>
          )}
        </div>
      </div>
    </details>
  );
}

function domainLabel(domain: KnowledgeEcologyDomain): string {
  switch (domain) {
    case "route_corridor":
      return "Routes";
    case "crossing":
      return "Crossings";
    case "place_country":
      return "Known country";
    case "food_work":
      return "Food work";
    case "water_refuge":
      return "Water and refuge";
    case "risk_caution":
      return "Caution";
    case "social_contact":
      return "Reports";
    case "inherited_memory":
      return "Inherited memory";
  }
}

function confidenceLabel(confidence: KnowledgeConfidenceBand): string {
  switch (confidence) {
    case "faint":
      return "faint";
    case "forming":
      return "forming";
    case "reliable":
      return "well known";
    case "durable":
      return "old memory";
    case "inherited":
      return "inherited";
    case "fading":
      return "fading";
  }
}

function practicalLabel(status: KnowledgePracticalStatus): string {
  switch (status) {
    case "practical":
      return "practiced";
    case "heard_about":
      return "heard";
    case "story_only":
      return "story";
    case "inherited_not_practiced":
      return "not practiced here";
    case "fading_uncertain":
      return "uncertain";
  }
}

function carrierLabel(carrier: KnowledgeCarrierCategory): string {
  switch (carrier) {
    case "whole_band":
      return "shared by the band";
    case "working_adults":
      return "carried by working adults";
    case "returning_activity_party":
      return "carried by returning parties";
    case "camp_group_heard":
      return "heard back at camp";
    case "daughter_inherited_memory":
      return "carried from parent memory";
    case "elder_or_old_memory":
      return "held as older memory";
    case "narrow_practical_carrier":
      return "held by a narrow carrier";
    case "uncertain_carrier":
      return "carrier uncertain";
  }
}

function transmissionLabel(status: KnowledgeEcologyItem["transmission"]): string {
  switch (status) {
    case "personally_practiced":
      return "learned by practice";
    case "heard_from_returning_party":
      return "heard from parties";
    case "widely_shared":
      return "shared in camp";
    case "inherited_story":
      return "inherited story";
    case "durable_memory":
      return "older memory";
    case "fading_or_uncertain":
      return "fading";
  }
}

function iconForEvidence(kind: KnowledgeEvidenceKind): IconName {
  switch (kind) {
    case "activity_trip":
    case "activity_summary":
      return "activity";
    case "canonical_event":
      return "time";
    case "crossing_memory":
      return "ford";
    case "deep_history":
    case "founding_snapshot":
      return "memory";
    case "demography":
      return "people";
    case "place_memory":
      return "camp";
    case "reported_knowledge":
      return "talk";
    case "residential_move":
    case "route_memory":
      return "route";
  }
}
