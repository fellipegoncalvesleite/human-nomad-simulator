import { useCallback, useMemo, useState } from "react";

import type { Band } from "../../sim/agents/types";
import type { BandId } from "../../sim/core/types";
import type { WorldState } from "../../sim/world/types";

import { useSimulationStore } from "../../store";
import { Icon } from "../icons";
import { deriveTalkOverviewModel, filterTalkCards } from "../reportedKnowledgeView";
import type { TalkCard, TalkFilterKey, TalkSectionDigest } from "../reportedKnowledgeView";
import { moodLabel } from "../labels";
import { MemoryReferentSection } from "./MemoryReferents";
import { CauseCard, Chip, SectionHeading } from "./parts";
import {
  absorptionKindLabel,
  accessPlaceTypeLabel,
  accessStateLabel,
  aggregationTriggerLabel,
  cohesionStatusLabel,
  hostilityStatusLabel,
  innerFissionStateLabel,
  intensityWord,
  reputationKindLabel,
  toleranceStatusLabel,
  weakBandFateLabel,
} from "./translate";

/*
 * READABILITY-UI-ORGANIZATION-1 — "How are they relating to each other and to
 * other bands?" Mood, cohesion, splits brewing, expectations about shared
 * places, remembered bands (by NAME, never id), gatherings, absorptions,
 * lineage — plus the talk & reports feed.
 */
export function People({
  band,
  world,
  defaultExpanded = false,
  onOpenChronicle,
}: {
  readonly band: Band;
  readonly world: WorldState | null;
  readonly defaultExpanded?: boolean;
  readonly onOpenChronicle?: (pageId: string) => void;
}) {
  const tension = band.socialTension;
  const fission = band.innerFission;
  const disposition = band.disposition;
  const access = band.protoAccessMemory?.currentPlace;
  const relationship = band.relationshipMemory;
  const viability = band.viability;
  const setSelectedBandId = useSimulationStore((state) => state.setSelectedBandId);
  const setSelectedActivityTripId = useSimulationStore((state) => state.setSelectedActivityTripId);
  const setSelectedTileId = useSimulationStore((state) => state.setSelectedTileId);
  const selectBand = useCallback(
    (bandId: BandId) => {
      setSelectedBandId(bandId);
      setSelectedActivityTripId(null);
      setSelectedTileId(null);
    },
    [setSelectedBandId, setSelectedActivityTripId, setSelectedTileId],
  );

  const bandNameOf = useCallback(
    (bandId: BandId | undefined): string => {
      if (bandId === undefined) {
        return "another band";
      }

      return world?.bands[bandId]?.name ?? "a band they once met";
    },
    [world],
  );

  return (
    <div className="bp-overview">
      {/* Population shape with its human meaning, not just counts. */}
      <section className="bp-section">
        <SectionHeading icon="people">The people</SectionHeading>
        <div className="story-block">
          <strong>{peopleShapeLine(band)}</strong>
          <p>{peopleChurnLine(band)}</p>
        </div>
      </section>

      {disposition === undefined ? null : (
        <section className="bp-section">
          <SectionHeading icon="status">The mood in camp</SectionHeading>
          <div className="story-block">
            <strong>{moodLabel(disposition.dominantMood)}</strong>
            {(disposition.moodReasons ?? []).slice(0, 3).map((reason) => (
              <p key={reason}>{reason}</p>
            ))}
          </div>
        </section>
      )}

      {tension === undefined ? null : (
        <section className="bp-section">
          <SectionHeading icon="people">Holding together</SectionHeading>
          <div className="story-block">
            <strong>{cohesionStatusLabel(tension.cohesionStatus)}</strong>
            <p>
              Day to day it looks like {toleranceStatusLabel(tension.toleranceStatus)}, with{" "}
              {hostilityStatusLabel(tension.hostilityStatus)}.
            </p>
          </div>
        </section>
      )}

      {fission === undefined || fission.state === "unified" ? null : (
        <CauseCard
          title={innerFissionStateLabel(fission.state)}
          because={(fission.topCauses ?? []).slice(0, 3)}
          note={fission.splitDelayedReason ?? fission.unityRecoveryReason}
        />
      )}

      {viability === undefined || viability.weakBandFate === undefined || viability.weakBandFate === "viable" ? null : (
        <section className="bp-section">
          <SectionHeading icon="risk">Standing on their own?</SectionHeading>
          <div className="story-block">
            <strong>
              {(() => {
                const fate = weakBandFateLabel(viability.weakBandFate);
                return `They are ${fate}.`;
              })()}
            </strong>
            {viability.lastStressSummary === undefined ? null : <p>{viability.lastStressSummary}</p>}
            {viability.supportSeekingGrounding === undefined ? null : <p>{viability.supportSeekingGrounding}</p>}
          </div>
        </section>
      )}

      {access === undefined || access.accessState === "none" ? null : (
        <section className="bp-section">
          <SectionHeading icon="talk">Who may use this place</SectionHeading>
          <div className="story-block">
            <strong>{accessStateLabel(access.accessState)}</strong>
            <p>
              At this {accessPlaceTypeLabel(access.placeType)}, watchfulness toward strangers is{" "}
              {intensityWord(access.strangerCaution)}, and pressure from shared use is {intensityWord(access.sharedUsePressure)}.
            </p>
            <p>These are habits and expectations — not fixed rules or borders.</p>
          </div>
        </section>
      )}

      <MemoryReferentSection
        band={band}
        world={world}
        title="Concrete social memories"
        icon="memory"
        kinds={["social_relation", "access_place", "talk_source"]}
        tab="people"
        limit={6}
        onOpenChronicle={onOpenChronicle}
      />

      {relationship === undefined || relationship.reputations.length === 0 ? null : (
        <section className="bp-section">
          <SectionHeading icon="lineage">Bands they remember</SectionHeading>
          <p className="condition-note">{relationshipLeadLine(relationship.reputations, bandNameOf)}</p>
          <ol className="recent-events">
            {relationship.reputations.slice(0, 5).map((reputation) => (
              <li key={String(reputation.otherBandId)} className="recent-event">
                <span className="recent-event-title">
                  <button
                    type="button"
                    className="talk-band-link"
                    onClick={() => selectBand(reputation.otherBandId)}
                    title="Inspect this band"
                  >
                    {bandNameOf(reputation.otherBandId)}
                  </button>{" "}
                  {reputationKindLabel(reputation.kind)}
                </span>
                <span className="recent-event-desc">{reputation.basis}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {relationship === undefined || relationship.seasonalAggregations.length === 0 ? null : (
        <section className="bp-section">
          <SectionHeading icon="people">Gatherings</SectionHeading>
          <ol className="recent-events">
            {relationship.seasonalAggregations.slice(0, 3).map((aggregation, index) => (
              <li key={`${String(aggregation.tileId)}-${index}`} className="recent-event">
                <span className="recent-event-title">
                  {(() => {
                    const trigger = aggregationTriggerLabel(aggregation.trigger);
                    return `People gather around ${trigger}`;
                  })()}
                </span>
                <span className="recent-event-desc">{aggregation.basis}</span>
              </li>
            ))}
          </ol>
          <p className="condition-note">Gatherings are temporary — they disperse; no one is settling.</p>
        </section>
      )}

      {relationship === undefined || relationship.absorptionDetails.length === 0 ? null : (
        <section className="bp-section">
          <SectionHeading icon="people">Joinings they remember</SectionHeading>
          <ol className="recent-events">
            {relationship.absorptionDetails.slice(0, 3).map((detail, index) => (
              <li key={`${detail.kind}-${index}`} className="recent-event">
                <span className="recent-event-title">
                  {(() => {
                    const kind = absorptionKindLabel(detail.kind);
                    return kind.charAt(0).toUpperCase() + kind.slice(1);
                  })()}
                </span>
                <span className="recent-event-desc">{detail.basis}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {band.parentBandId === undefined && band.daughterBandIds.length === 0 ? null : (
        <section className="bp-section">
          <SectionHeading icon="lineage">Lineage</SectionHeading>
          {band.parentBandId === undefined ? null : (
            <p className="condition-note">
              They split from{" "}
              <button type="button" className="talk-band-link" onClick={() => selectBand(band.parentBandId as BandId)}>
                {bandNameOf(band.parentBandId)}
              </button>
              .
            </p>
          )}
          {band.daughterBandIds.length === 0 ? null : (
            <p className="condition-note">
              Daughter bands set out from here:{" "}
              {band.daughterBandIds.slice(0, 4).map((daughterId, index) => (
                <span key={String(daughterId)}>
                  {index > 0 ? ", " : ""}
                  <button type="button" className="talk-band-link" onClick={() => selectBand(daughterId)}>
                    {bandNameOf(daughterId)}
                  </button>
                </span>
              ))}
              .
            </p>
          )}
        </section>
      )}

      {activeTalkTopics(band).length === 0 ? null : (
        <section className="bp-section">
          <SectionHeading icon="talk">Active talk</SectionHeading>
          <p className="condition-note">
            Around camp, talk runs to {joinTopics(activeTalkTopics(band))}. Individual voices and reports are below.
          </p>
        </section>
      )}

      <TalkAndReports
        band={band}
        world={world}
        defaultExpanded={defaultExpanded}
        onSelectBand={selectBand}
      />
    </div>
  );
}

/* One grouped line of what talk is ABOUT, before the individual reports. */
function activeTalkTopics(band: Band): readonly string[] {
  const items = band.campRumors?.items ?? [];
  const topics: string[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    const topic = String(item.category).split("_").join(" ");

    if (!seen.has(topic)) {
      seen.add(topic);
      topics.push(topic);
    }

    if (topics.length >= 6) {
      break;
    }
  }

  return topics;
}

function joinTopics(topics: readonly string[]): string {
  if (topics.length <= 1) {
    return topics[0] ?? "";
  }

  return `${topics.slice(0, -1).join(", ")} and ${topics[topics.length - 1]}`;
}

function relationshipLeadLine(
  reputations: NonNullable<Band["relationshipMemory"]>["reputations"],
  bandNameOf: (bandId: BandId | undefined) => string,
): string {
  const strongest = reputations[0];

  if (strongest === undefined) {
    return "No other band sits firmly in living memory yet.";
  }

  const others = reputations.length - 1;
  const tail = others <= 0 ? "" : ` ${others} other band${others === 1 ? " is" : "s are"} remembered more faintly.`;

  return `The strongest tie is with ${bandNameOf(strongest.otherBandId)}, ${reputationKindLabel(strongest.kind)}.${tail}`;
}

/* People-shape prose: the same counts Survival shows as tiles, but read for
 * what they mean — who carries whom, and what the churn cost. */
function peopleShapeLine(band: Band): string {
  const demography = band.demography;
  const population = Math.max(0, Math.round(demography.population));
  const households = Math.max(1, Math.round(demography.householdCount));
  const workers = Math.max(0, Math.round(demography.workingAdults));
  const dependents = Math.max(0, Math.round(demography.dependents));
  const elders = Math.max(0, Math.round(demography.elders));

  return `${population} people in ${households} household${households === 1 ? "" : "s"} — ${workers} working adult${workers === 1 ? "" : "s"} carrying ${dependents} child${dependents === 1 ? "" : "ren"} and ${elders} elder${elders === 1 ? "" : "s"}.`;
}

function peopleChurnLine(band: Band): string {
  const churn = band.demography.demographicChurn;
  const births = churn?.birthsThisYear ?? 0;
  const deaths = churn?.deathsThisYear ?? 0;

  if (births > 0 && deaths > 0) {
    return "Births and deaths this year roughly traded places — but a steady headcount hides the churn, and each lost worker cuts deeper than the count shows.";
  }

  if (deaths > 0) {
    return `${deaths} death${deaths === 1 ? "" : "s"} this year thinned the hands available for work.`;
  }

  if (births > 0) {
    return `${births} birth${births === 1 ? "" : "s"} this year — more mouths now, more hands later.`;
  }

  return "No births or deaths this year; the shape of the band is holding.";
}

/* ------------------------- talk & reports (moved from Overview) ------------ */

const TALK_FILTERS: readonly { readonly key: TalkFilterKey; readonly label: string }[] = [
  { key: "all", label: "All" },
  { key: "warnings", label: "Warnings" },
  { key: "opportunities", label: "Opportunities" },
  { key: "speculations", label: "Speculations" },
  { key: "checked", label: "Checked" },
  { key: "fading", label: "Fading" },
];

function TalkAndReports({
  band,
  world,
  defaultExpanded,
  onSelectBand,
}: {
  readonly band: Band;
  readonly world: WorldState | null;
  readonly defaultExpanded: boolean;
  readonly onSelectBand: (bandId: BandId) => void;
}) {
  const [internalExpanded, setInternalExpanded] = useState(defaultExpanded);
  const [interBandExpanded, setInterBandExpanded] = useState(defaultExpanded);
  const [internalFilter, setInternalFilter] = useState<TalkFilterKey>("all");
  const [interBandFilter, setInterBandFilter] = useState<TalkFilterKey>("all");
  // Talk depends only on the band's report ring; memoize by band id + last-updated
  // tick so it is not re-derived on every unrelated re-render.
  const talk = useMemo(
    () => deriveTalkOverviewModel(band),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      band.id,
      band.reportedKnowledge?.lastUpdatedTick,
      band.reportedKnowledge?.reports.length,
      band.reportedKnowledge?.speculations?.length,
    ],
  );

  if (talk.activeCount === 0) {
    return null;
  }

  return (
    <section className="bp-section">
      <SectionHeading icon="talk">Talk &amp; reports</SectionHeading>
      <div className="talk-split">
        <TalkPanel
          section={talk.internal}
          world={world}
          expanded={internalExpanded}
          filter={internalFilter}
          onToggle={() => setInternalExpanded((value) => !value)}
          onFilter={setInternalFilter}
          onSelectBand={onSelectBand}
        />
        <TalkPanel
          section={talk.interBand}
          world={world}
          expanded={interBandExpanded}
          filter={interBandFilter}
          onToggle={() => setInterBandExpanded((value) => !value)}
          onFilter={setInterBandFilter}
          onSelectBand={onSelectBand}
        />
      </div>
      <p className="talk-more-note">Talk only nudges scouting, probes, and caution; it never reveals exact hidden places.</p>
    </section>
  );
}

function TalkPanel({
  section,
  world,
  expanded,
  filter,
  onToggle,
  onFilter,
  onSelectBand,
}: {
  readonly section: TalkSectionDigest;
  readonly world: WorldState | null;
  readonly expanded: boolean;
  readonly filter: TalkFilterKey;
  readonly onToggle: () => void;
  readonly onFilter: (filter: TalkFilterKey) => void;
  readonly onSelectBand: (bandId: BandId) => void;
}) {
  const cards = expanded ? filterTalkCards(section.allCards, filter) : section.cards;
  const hasMore = section.moreCount > 0;

  return (
    <div className="talk-panel">
      <div className="talk-panel-head">
        <div>
          <span className="talk-panel-title">{section.title}</span>
          <span className="talk-panel-meta">{section.activeCount} active</span>
        </div>
        {section.activeCount <= 3 ? null : (
          <button type="button" className="talk-toggle" onClick={onToggle}>
            {expanded ? "Show top 3" : `Show all (${section.activeCount})`}
          </button>
        )}
      </div>
      {/* 1C — with many active reports, say what the talk is ABOUT before
          listing individual voices. */}
      {!expanded && section.activeCount >= 12 ? (
        <p className="talk-group-note">
          Mostly about {joinTopics(
            [...new Set(section.allCards.map((card) => card.title.toLowerCase()))].slice(0, 6),
          )}.
        </p>
      ) : null}
      {expanded ? (
        <div className="talk-filter-row" role="list" aria-label={`${section.title} filters`}>
          {TALK_FILTERS.map((entry) => (
            <button
              key={`${section.key}-${entry.key}`}
              type="button"
              className={filter === entry.key ? "talk-filter-button active" : "talk-filter-button"}
              onClick={() => onFilter(entry.key)}
            >
              {entry.label}
            </button>
          ))}
        </div>
      ) : null}
      {cards.length === 0 ? (
        <p className="talk-empty">
          {expanded && filter !== "all" ? "No active talk matches this filter." : "No active talk remembered here."}
        </p>
      ) : (
        <div className="talk-cards">
          {cards.map((card) => (
            <TalkCardRow key={card.id} card={card} world={world} expanded={expanded} onSelectBand={onSelectBand} />
          ))}
        </div>
      )}
      {section.groupNote === undefined ? null : <p className="talk-group-note">{section.groupNote}</p>}
      {!expanded && hasMore ? <p className="talk-more-note">+{section.moreCount} more active talks</p> : null}
    </div>
  );
}

function TalkCardRow({
  card,
  world,
  expanded,
  onSelectBand,
}: {
  readonly card: TalkCard;
  readonly world: WorldState | null;
  readonly expanded: boolean;
  readonly onSelectBand: (bandId: BandId) => void;
}) {
  const isInterBand = card.sourceBandId !== undefined;
  const senderBand = isInterBand && world !== null ? world.bands[card.sourceBandId as BandId] : undefined;
  const senderName = senderBand?.name ?? "another band";
  const whereText = isInterBand ? card.region : `${card.source} · ${card.region}`;

  return (
    <div className={expanded ? `talk-card tone-${card.tone} expanded` : `talk-card tone-${card.tone}`}>
      <span className="talk-card-icon">
        <Icon name={card.icon} />
      </span>
      <div className="talk-card-body">
        <div className="talk-card-head">
          <span className="talk-card-title" title={card.title}>
            {card.title}
          </span>
          <span className="talk-card-category">{card.categoryLabel}</span>
        </div>
        {isInterBand ? (
          <div className="talk-card-from">
            <span className="talk-where-lead">Heard from</span>
            <button
              type="button"
              className="talk-band-link"
              onClick={() => onSelectBand(card.sourceBandId as BandId)}
              title={`Inspect ${senderName}`}
            >
              {senderBand !== undefined ? (
                <span className="talk-band-swatch" style={{ background: senderBand.color }} aria-hidden />
              ) : null}
              <span className="talk-band-name">{senderName}</span>
            </button>
          </div>
        ) : null}
        <div className="talk-card-where" title={whereText}>
          {whereText}
        </div>
        {card.lifecycle === undefined ? null : (
          <div className="talk-card-life" title={card.lifecycle}>
            {card.lifecycle}
          </div>
        )}
        <div className="talk-badges">
          {card.badges.slice(0, expanded ? 4 : 3).map((badge) => (
            <span key={badge.label} className={`talk-badge tone-${badge.tone}`} title={badge.title}>
              {badge.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
