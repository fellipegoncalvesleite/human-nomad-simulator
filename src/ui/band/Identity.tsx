import { useMemo } from "react";

import {
  deriveBandIdentityProfile,
  type BandIdentityCard,
  type BandIdentityDimension,
  type BandIdentityEvidenceKind,
  type BandIdentityStrength,
} from "../../sim/agents/bandIdentity";
import type { Band } from "../../sim/agents/types";
import type { WorldState } from "../../sim/world/types";

import { Icon, type IconName } from "../icons";
import { Chip, SectionHeading } from "./parts";

const DIMENSION_ICON: Readonly<Record<BandIdentityDimension, IconName>> = {
  subsistence: "food",
  familiar_country: "range",
  mobility_style: "route",
  risk_memory: "risk",
  social_demographic: "people",
  inheritance: "lineage",
};

export function Identity({
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
    () => (world === null ? undefined : deriveBandIdentityProfile(world, band)),
    [band, world],
  );

  if (profile === undefined) {
    return (
      <section className="bp-section band-identity">
        <SectionHeading icon="memory">Identity</SectionHeading>
        <p className="condition-note">World detail is unavailable for the selected band.</p>
      </section>
    );
  }

  return (
    <section className="bp-section band-identity" aria-label="band identity">
      <SectionHeading icon="memory">Identity</SectionHeading>
      <p className="condition-note">
        Identity is a cautious reading of lived evidence: repeated places, pressure, activity, demography, events, and inherited history. It does not change decisions yet.
      </p>

      <article className="identity-lead">
        <span className="identity-kicker">Who they are becoming</span>
        <h3>{profile.summaryTitle}</h3>
        {profile.summaryLines.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </article>

      <div className="identity-card-grid">
        {profile.cards.map((card) => (
          <IdentityCard
            key={card.id}
            card={card}
            onOpenChronicle={onOpenChronicle}
            onOpenEvents={onOpenEvents}
          />
        ))}
      </div>
    </section>
  );
}

function IdentityCard({
  card,
  onOpenChronicle,
  onOpenEvents,
}: {
  readonly card: BandIdentityCard;
  readonly onOpenChronicle?: (pageId: string) => void;
  readonly onOpenEvents?: () => void;
}) {
  const chronicleTarget = card.relatedChronicleLinkIds[0];

  return (
    <details className={`identity-card strength-${card.strength}`}>
      <summary>
        <span className="identity-card-icon">
          <Icon name={DIMENSION_ICON[card.dimension]} />
        </span>
        <span className="identity-card-head">
          <span className="identity-card-kicker">{dimensionLabel(card.dimension)}</span>
          <span className="identity-card-title">{card.title}</span>
          <span className="identity-card-summary">{card.summary}</span>
        </span>
        <span className="identity-card-chips">
          <Chip>{strengthLabel(card.strength)}</Chip>
          {card.inheritedEvidenceCount > 0 ? <Chip>inherited separated</Chip> : null}
        </span>
      </summary>
      <div className="identity-card-body">
        {card.uncertainty === undefined ? null : <p className="identity-uncertainty">{card.uncertainty}</p>}
        <div className="identity-meta-row">
          <span>{confidenceLabel(card.confidence)}</span>
          <span>{card.evidence.length} evidence chip{card.evidence.length === 1 ? "" : "s"}</span>
          <span>{card.livedEvidenceCount} lived</span>
          {card.inheritedEvidenceCount > 0 ? <span>{card.inheritedEvidenceCount} inherited</span> : null}
        </div>
        <div className="identity-evidence-list" aria-label="identity evidence">
          {card.evidence.map((entry, index) => (
            <span key={`${card.id}:${entry.kind}:${entry.label}:${index}`} className="identity-evidence-chip">
              <Icon name={iconForEvidence(entry.kind)} size={13} />
              <span>{entry.label}</span>
            </span>
          ))}
        </div>
        <div className="identity-link-row">
          {card.relatedEventIds.length === 0 || onOpenEvents === undefined ? null : (
            <button type="button" className="chronicle-link small" onClick={onOpenEvents}>
              <Icon name="time" />
              <span>View supporting events</span>
            </button>
          )}
          {chronicleTarget === undefined || onOpenChronicle === undefined ? null : (
            <button type="button" className="chronicle-link small" onClick={() => onOpenChronicle(chronicleTarget)}>
              <Icon name="knowledge" />
              <span>Open Chronicle support</span>
            </button>
          )}
        </div>
      </div>
    </details>
  );
}

function dimensionLabel(dimension: BandIdentityDimension): string {
  switch (dimension) {
    case "subsistence":
      return "Food tendency";
    case "familiar_country":
      return "Familiar country";
    case "mobility_style":
      return "Movement style";
    case "risk_memory":
      return "Remembered risks";
    case "social_demographic":
      return "People and labor";
    case "inheritance":
      return "Inheritance";
  }
}

function strengthLabel(strength: BandIdentityStrength): string {
  switch (strength) {
    case "uncertain":
      return "uncertain";
    case "weak":
      return "weak signal";
    case "forming":
      return "forming";
    case "established":
      return "established";
    case "durable":
      return "long memory";
    case "inherited":
      return "inherited";
  }
}

function confidenceLabel(confidence: number): string {
  if (confidence >= 0.72) {
    return "strong support";
  }
  if (confidence >= 0.48) {
    return "moderate support";
  }
  return "light support";
}

function iconForEvidence(kind: BandIdentityEvidenceKind): IconName {
  switch (kind) {
    case "activity":
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
    case "residential_move":
    case "route_memory":
      return "route";
    case "seasonal_support":
      return "pressure";
    case "relationship_memory":
      return "talk";
  }
}
