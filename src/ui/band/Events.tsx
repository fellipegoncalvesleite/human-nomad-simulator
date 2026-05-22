import { useMemo, useState } from "react";

import {
  deriveCanonicalEvents,
  familyLabel,
  type CanonicalEvent,
  type CanonicalEventFamily,
  type CanonicalEventMemoryScope,
  type CanonicalEventState,
} from "../../sim/agents/eventSystem";
import { deriveBandChronicle } from "../../sim/agents/bandChronicle";
import type { Band } from "../../sim/agents/types";
import type { WorldState } from "../../sim/world/types";

import { Icon, type IconName } from "../icons";
import { Chip, CollapsibleGroup, SectionHeading } from "./parts";

type EventFilter = "all" | CanonicalEventFamily;

const EVENT_FILTERS: readonly EventFilter[] = [
  "all",
  "origin_lineage",
  "demography",
  "movement_place",
  "route_crossing",
  "knowledge_memory",
  "food_water_pressure",
  "contact_social",
  "historical_compression",
];

const FAMILY_ICON: Readonly<Record<CanonicalEventFamily, IconName>> = {
  origin_lineage: "lineage",
  demography: "people",
  movement_place: "camp",
  route_crossing: "route",
  knowledge_memory: "memory",
  food_water_pressure: "pressure",
  contact_social: "talk",
  historical_compression: "time",
};

export function Events({
  band,
  world,
  onOpenChronicle,
}: {
  readonly band: Band;
  readonly world: WorldState | null;
  readonly onOpenChronicle?: (pageId: string) => void;
}) {
  const eventState = useMemo(
    () => (world === null ? undefined : deriveCanonicalEvents(world, band)),
    [band, world],
  );
  const chroniclePageIds = useMemo(() => {
    if (world === null) {
      return new Set<string>();
    }
    const chronicle = deriveBandChronicle(world, band);
    return new Set(chronicle.pages.map((page) => page.id));
  }, [band, world]);
  const [filter, setFilter] = useState<EventFilter>("all");

  if (eventState === undefined) {
    return (
      <section className="bp-section band-events">
        <SectionHeading icon="time">Events</SectionHeading>
        <p className="condition-note">World detail is unavailable for the selected band.</p>
      </section>
    );
  }

  const visibleEvents = eventState.events.filter((event) => filter === "all" || event.family === filter);
  const { featuredEvents, quieterEvents } = splitVisibleEvents(visibleEvents, filter);

  return (
    <section className="bp-section band-events" aria-label="canonical events">
      <SectionHeading icon="time">Events</SectionHeading>
      <p className="condition-note">
        This is the band's event record: concrete changes in people, places, pressure, and memory. Talk can mention an event, but the record below is what the simulator can ground.
      </p>

      <EventOverview state={eventState} />

      <div className="event-filter-row" aria-label="event family filters">
        {EVENT_FILTERS.map((entry) => (
          <button
            key={entry}
            type="button"
            className={filter === entry ? "active" : undefined}
            aria-pressed={filter === entry}
            onClick={() => setFilter(entry)}
          >
            {eventFilterLabel(entry)}
          </button>
        ))}
      </div>

      {visibleEvents.length === 0 ? (
        <p className="condition-note">No grounded events in this family are available for the selected band.</p>
      ) : (
        <>
          {quieterEvents.length === 0 ? null : (
            <p className="event-list-note">Showing the higher-signal records first. Smaller recent changes are folded below.</p>
          )}
          <div className="canonical-event-list">
            {featuredEvents.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                chroniclePageIds={chroniclePageIds}
                onOpenChronicle={onOpenChronicle}
              />
            ))}
          </div>
          {quieterEvents.length === 0 ? null : (
            <CollapsibleGroup title={`Quieter recent records (${quieterEvents.length})`}>
              <p className="event-list-note">These are still grounded records, kept out of the main list so Events reads like history instead of a tick log.</p>
              <div className="canonical-event-list">
                {quieterEvents.map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    chroniclePageIds={chroniclePageIds}
                    onOpenChronicle={onOpenChronicle}
                  />
                ))}
              </div>
            </CollapsibleGroup>
          )}
        </>
      )}
    </section>
  );
}

function EventOverview({ state }: { readonly state: CanonicalEventState }) {
  const familySummary = Object.entries(state.familyCounts)
    .filter(([, count]) => count > 0)
    .map(([family, count]) => `${publicFamilyLabel(family as CanonicalEventFamily)} ${count}`)
    .join(" · ");

  return (
    <div className="event-overview" aria-label="event overview">
      <div>
        <span className="event-overview-label">Records</span>
        <strong>{state.events.length}</strong>
      </div>
      <div>
        <span className="event-overview-label">Recent detail / long memory</span>
        <strong>{state.recentEventCount} / {state.durableEventCount}</strong>
      </div>
      <div>
        <span className="event-overview-label">Inherited memory</span>
        <strong>{state.inheritedEventCount}</strong>
      </div>
      <div>
        <span className="event-overview-label">Folded repeats</span>
        <strong>{state.groupedEventCount}</strong>
      </div>
      <p>{familySummary.length === 0 ? "No event kinds available yet." : `In view: ${familySummary}`}</p>
    </div>
  );
}

function EventCard({
  event,
  chroniclePageIds,
  onOpenChronicle,
}: {
  readonly event: CanonicalEvent;
  readonly chroniclePageIds: ReadonlySet<string>;
  readonly onOpenChronicle?: (pageId: string) => void;
}) {
  const chronicleLink = event.chronicleLinkIds.find((linkId) => chroniclePageIds.has(linkId));
  const related = relatedLine(event);

  return (
    <details className={`canonical-event-card scope-${event.memoryScope}`}>
      <summary>
        <span className="canonical-event-icon">
          <Icon name={FAMILY_ICON[event.family]} />
        </span>
        <span className="canonical-event-summary">
          <span className="canonical-event-topline">
            <span className="canonical-event-years">{formatEventYearRange(event.startYear, event.endYear)}</span>
            <span className="canonical-event-title">{event.title}</span>
          </span>
          <span className="canonical-event-line">{event.summary}</span>
        </span>
        <span className="canonical-event-chips">
          <Chip>{scopeLabel(event.memoryScope)}</Chip>
          {event.livedStatus === "inherited_not_personally_lived" ? <Chip>inherited only</Chip> : null}
        </span>
      </summary>
      <div className="canonical-event-body">
        <div className="canonical-event-meta">
          <span>{publicFamilyLabel(event.family)}</span>
          <span>{provenanceLabel(event.provenance)}</span>
          {event.grouped ? <span>{event.groupedCount} similar records folded</span> : null}
          {event.actualCause === undefined ? null : <span>Grounded from {event.actualCause}</span>}
        </div>
        <p>{event.consequence}</p>
        {related.length === 0 ? null : <p className="canonical-event-related">{related}</p>}
        {event.evidenceChips.length === 0 ? null : (
          <div className="chronicle-evidence-chips" aria-label="event evidence">
            {event.evidenceChips.map((chip) => (
              <span key={`${event.id}:${chip.kind}:${chip.label}`} className="chronicle-evidence-chip">{chip.label}</span>
            ))}
          </div>
        )}
        <div className="canonical-event-link-row">
          {chronicleLink === undefined || onOpenChronicle === undefined ? null : (
            <button type="button" className="chronicle-link small" onClick={() => onOpenChronicle(chronicleLink)}>
              <Icon name="knowledge" />
              <span>Open in Chronicle</span>
            </button>
          )}
          {event.chronicleSectionIds.includes("article-long-memory") ? (
            <span className="canonical-event-proof-note">Also appears in Long memory.</span>
          ) : null}
          {event.relatedTalkIds.length === 0 ? null : (
            <span className="canonical-event-proof-note">Talk can mention this; the event record is the proof.</span>
          )}
        </div>
      </div>
    </details>
  );
}

function splitVisibleEvents(
  visibleEvents: readonly CanonicalEvent[],
  filter: EventFilter,
): {
  readonly featuredEvents: readonly CanonicalEvent[];
  readonly quieterEvents: readonly CanonicalEvent[];
} {
  if (filter !== "all" || visibleEvents.length <= 9) {
    return { featuredEvents: visibleEvents, quieterEvents: [] };
  }

  const featuredIds = new Set<string>();
  const featuredEvents: CanonicalEvent[] = [];

  for (const event of visibleEvents) {
    if (isFeaturedEvent(event)) {
      featuredIds.add(event.id);
      featuredEvents.push(event);
    }
    if (featuredEvents.length >= 9) {
      break;
    }
  }

  for (const event of visibleEvents) {
    if (featuredEvents.length >= 9) {
      break;
    }
    if (!featuredIds.has(event.id)) {
      featuredIds.add(event.id);
      featuredEvents.push(event);
    }
  }

  return {
    featuredEvents,
    quieterEvents: visibleEvents.filter((event) => !featuredIds.has(event.id)),
  };
}

function isFeaturedEvent(event: CanonicalEvent): boolean {
  return event.memoryScope !== "recent" ||
    event.livedStatus === "inherited_not_personally_lived" ||
    event.family === "origin_lineage" ||
    event.grouped ||
    event.significance >= 0.62 ||
    event.severity >= 0.7;
}

function relatedLine(event: CanonicalEvent): string {
  const parts = [
    event.involvedBandIds.length > 1 ? `${event.involvedBandIds.length - 1} related band${event.involvedBandIds.length === 2 ? "" : "s"}` : undefined,
    event.involvedTileIds.length > 0 ? `${event.involvedTileIds.length} remembered place${event.involvedTileIds.length === 1 ? "" : "s"}` : undefined,
    event.involvedRouteIds.length > 0 ? `${event.involvedRouteIds.length} remembered route${event.involvedRouteIds.length === 1 ? "" : "s"}` : undefined,
    event.relatedReferentIds.length > 0 ? `${event.relatedReferentIds.length} related memory card${event.relatedReferentIds.length === 1 ? "" : "s"}` : undefined,
    event.relatedTalkIds.length > 0 ? `${event.relatedTalkIds.length} talk mention${event.relatedTalkIds.length === 1 ? "" : "s"}` : undefined,
  ].filter((part): part is string => part !== undefined);

  return parts.join(" · ");
}

function eventFilterLabel(filter: EventFilter): string {
  if (filter === "all") {
    return "All";
  }
  return publicFamilyLabel(filter);
}

function publicFamilyLabel(family: CanonicalEventFamily): string {
  switch (family) {
    case "origin_lineage":
      return "Beginnings";
    case "demography":
      return "People";
    case "movement_place":
      return "Places & moves";
    case "route_crossing":
      return "Routes";
    case "knowledge_memory":
      return "Memory";
    case "food_water_pressure":
      return "Pressure";
    case "contact_social":
      return "Contacts";
    case "historical_compression":
      return "Long memory";
  }
}

function scopeLabel(scope: CanonicalEventMemoryScope): string {
  switch (scope) {
    case "recent":
      return "recent detail";
    case "durable":
      return "long memory";
    case "inherited":
      return "inherited memory";
  }
}

function provenanceLabel(provenance: CanonicalEvent["provenance"]): string {
  switch (provenance) {
    case "direct_sim_transition":
      return "recorded change";
    case "grouped_recent_pattern":
      return "folded recent pattern";
    case "compressed_deep_history":
      return "compressed older history";
    case "deep_history_episode":
      return "long-memory episode";
    case "inherited_history":
      return "parent memory";
    case "terminal_record":
      return "end record";
    case "movement_trace":
      return "move record";
  }
}

function formatEventYearRange(startYear: number, endYear: number): string {
  return startYear === endYear ? `Year ${startYear}` : `Years ${startYear}-${endYear}`;
}
