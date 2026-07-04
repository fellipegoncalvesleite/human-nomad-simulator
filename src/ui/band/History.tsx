import { useEffect, useMemo, useState } from "react";

import { deriveBandChronicle } from "../../sim/agents/bandChronicle";
import type {
  BandChroniclePage,
  BandChronicleParagraph,
  BandChroniclePeriod,
  BandChronicleDeepHistorySummary,
  BandChronicleState,
} from "../../sim/agents/bandChronicle";
import type { Band, BandReadableEvent, BandReadableEventCategory } from "../../sim/agents/types";
import type { Action, Decision } from "../../sim/rules/types";
import type { WorldState } from "../../sim/world/types";

import { useSimulationStore } from "../../store";
import { Icon } from "../icons";
import type { IconName } from "../icons";
import type { StatusTone } from "../bandSummary";
import { humanize, intentLabel, reasonLabel } from "../labels";
import { deriveReportHistoryNotes } from "../reportedKnowledgeView";
import { MemoryReferentSection } from "./MemoryReferents";
import { CollapsibleGroup, SectionHeading } from "./parts";
import {
  CorridorDetails,
  DecisionDetails,
  MovementHistoryDetails,
  PlaceMemoryDetails,
  ResidentialMoveDetails,
  RiverCrossingDetails,
} from "./sections";

/*
 * BAND-CHRONICLE-WIKI-EXPANSION-1 — the Chronicle tab reads like a small
 * in-game encyclopedia article: lead, infobox, contents, chronological period
 * prose, and thematic sections, with inline links that open focused pages
 * (years, long stories, events, remembered things, places, routes, resources)
 * in a local router with a back stack. Arcs and link targets are mechanics the
 * article uses to tell the story; they are never surfaced as raw lists here.
 * Raw ids, scores, and proof stay in Technical.
 */

interface TimelineItem {
  readonly key: string;
  readonly tick: number;
  readonly when: string;
  readonly icon: IconName;
  readonly title: string;
  readonly detail?: string;
  readonly tone?: StatusTone;
}

type ReadableEventFilter = "all" | BandReadableEventCategory;

const READABLE_EVENT_FILTERS: readonly { readonly key: ReadableEventFilter; readonly label: string }[] = [
  { key: "all", label: "All" },
  { key: "survival", label: "Survival" },
  { key: "demography", label: "Demography" },
  { key: "movement", label: "Movement" },
  { key: "activity", label: "Activity" },
  { key: "adaptation", label: "Adaptation" },
  { key: "body_logistics", label: "Logistics" },
  { key: "relationship_memory", label: "Relations" },
  { key: "weak_band_fate", label: "Weak fate" },
  { key: "death_memory", label: "Death" },
  { key: "inner_fission", label: "Internal" },
  { key: "social_tension", label: "Social" },
  { key: "access_norms", label: "Access" },
  { key: "lineage", label: "Lineage" },
  { key: "camp_place", label: "Camp/place" },
  { key: "resource_ecology", label: "Resources" },
  { key: "nature", label: "Nature" },
];

// Icons for the article's thematic sections (titles come from the projection;
// these labels double as the stable audit anchors for the section names,
// e.g. "Important places" and "Food and ecology").
const SECTION_META: Readonly<Record<string, { readonly icon: IconName; readonly label: string }>> = {
  places: { icon: "camp", label: "Important places" },
  "food-ecology": { icon: "food", label: "Food and ecology" },
  "movement-crossings": { icon: "route", label: "Movement and crossings" },
  "people-social": { icon: "people", label: "People and social history" },
  "talk-memory": { icon: "talk", label: "Talk and memory" },
};

const PAGE_KIND_ICON: Readonly<Record<BandChroniclePage["kind"], IconName>> = {
  year: "time",
  period: "route",
  event: "memory",
  referent: "memory",
  place: "camp",
  route: "route",
  resource: "food",
};

const ACTION_TEXT: Partial<Record<Action["type"], string>> = {
  stay: "Stayed put",
  move_to_tile: "Moved to new ground",
  explore_unknown_neighbor: "Explored nearby land",
  logistical_probe: "Sent out a probe",
};

function cap(value: string): string {
  return value.length === 0 ? value : value.charAt(0).toUpperCase() + value.slice(1);
}

function buildTimeline(band: Band, currentTick: number): readonly TimelineItem[] {
  const items: TimelineItem[] = [];

  for (const event of band.eventHistory?.recentEvents.slice(0, 10) ?? []) {
    items.push({
      key: String(event.eventId),
      tick: Number(event.tick),
      when: `${cap(event.season)} · Y${event.year}`,
      icon: iconForReadableEvent(event),
      title: event.title,
      detail: event.description,
      tone: toneForReadableEvent(event),
    });
  }

  for (const note of deriveReportHistoryNotes(band, currentTick as Parameters<typeof deriveReportHistoryNotes>[1])) {
    items.push({
      key: note.key,
      tick: note.tick,
      when: note.when,
      icon: note.icon,
      title: note.title,
      detail: note.detail,
      tone: note.tone,
    });
  }

  for (const move of band.movementHistory.slice(-6)) {
    const movementText = describeMovementHistory(move.intentKind);
    items.push({
      key: `mv-${String(move.decisionId)}-${String(move.tick)}`,
      tick: Number(move.tick),
      when: `${cap(move.time.season)} · Y${move.time.year}`,
      icon: movementText.icon,
      title: movementText.title,
      detail: movementText.detail,
    });
  }

  for (const event of band.recentResidentialMoveEvents ?? []) {
    const residentialText = describeResidentialMove(event.moveKind, event.cause, event.distanceTiles, event.durationDays);
    items.push({
      key: `rm-${String(event.eventId)}`,
      tick: Number(event.tick),
      when: cap(event.season),
      icon: residentialText.icon,
      title: residentialText.title,
      detail: residentialText.detail,
    });
  }

  for (const fission of band.fissionEvents.slice(-3)) {
    const fissionText = describeFissionEvent(fission.splitReason.type);
    items.push({
      key: `fs-${String(fission.id)}`,
      tick: Number(fission.tick),
      when: `${cap(fission.time.season)} · Y${fission.time.year}`,
      icon: fissionText.icon,
      title: fissionText.title,
      detail: fissionText.detail,
    });
  }

  for (const encounter of band.encounterRecords.slice(-4)) {
    items.push({
      key: `en-${String(encounter.id)}`,
      tick: Number(encounter.tick),
      when: `${cap(encounter.time.season)} · Y${encounter.time.year}`,
      icon: "people",
      title: "Met another band",
      detail: `${humanize(encounter.relation)} · ${humanize(encounter.outcome)}`,
    });
  }

  return items.sort((left, right) => right.tick - left.tick).slice(0, 10);
}

// --- Wiki navigation ---------------------------------------------------------

interface ChronicleNav {
  readonly openPage: (linkId: string) => void;
  readonly isLink: (linkId: string) => boolean;
  readonly pageMap: ReadonlyMap<string, BandChroniclePage>;
}

function ChronicleProse({
  paragraph,
  nav,
}: {
  readonly paragraph: BandChronicleParagraph;
  readonly nav: ChronicleNav;
}) {
  return (
    <p className="chronicle-prose">
      {paragraph.segments.map((segment, index) => {
        const linkId = segment.linkId;
        if (linkId !== undefined && nav.isLink(linkId)) {
          return (
            <button
              key={`${paragraph.id}:${index}`}
              type="button"
              className="chronicle-link inline"
              onClick={() => nav.openPage(linkId)}
            >
              {segment.text}
            </button>
          );
        }

        return <span key={`${paragraph.id}:${index}`}>{segment.text}</span>;
      })}
    </p>
  );
}

function ChronicleLinkChips({
  chronicle,
  linkIds,
  nav,
  cap: linkCap = 6,
}: {
  readonly chronicle: BandChronicleState;
  readonly linkIds: readonly string[];
  readonly nav: ChronicleNav;
  readonly cap?: number;
}) {
  const links = linkIds
    .map((linkId) => {
      const page = nav.pageMap.get(linkId);
      if (page !== undefined) {
        return { id: linkId, label: page.title, icon: PAGE_KIND_ICON[page.kind] };
      }

      const target = chronicle.linkTargets.find((entry) => entry.id === linkId && entry.inactiveFutureHook !== true);
      if (target !== undefined && target.kind === "band") {
        return { id: linkId, label: target.label, icon: "people" as IconName };
      }

      return undefined;
    })
    .filter((link): link is { id: string; label: string; icon: IconName } => link !== undefined)
    .slice(0, linkCap);

  if (links.length === 0) {
    return null;
  }

  return (
    <div className="chronicle-links" aria-label="related history links">
      {links.map((link) => (
        <button key={link.id} type="button" className="chronicle-link" title={link.label} onClick={() => nav.openPage(link.id)}>
          <Icon name={link.icon} />
          <span>{link.label}</span>
        </button>
      ))}
    </div>
  );
}

function ChronicleInfobox({
  chronicle,
  nav,
}: {
  readonly chronicle: BandChronicleState;
  readonly nav: ChronicleNav;
}) {
  const facts = chronicle.article.infobox;

  if (facts.length === 0) {
    return null;
  }

  return (
    <aside className="chronicle-infobox" aria-label="band fact summary">
      <dl>
        {facts.map((fact) => {
          const linkId = fact.linkId;
          return (
            <div key={fact.label} className="chronicle-infobox-row">
              <dt>{fact.label}</dt>
              <dd title={fact.value}>
                {linkId !== undefined && nav.isLink(linkId) ? (
                  <button type="button" className="chronicle-link inline" onClick={() => nav.openPage(linkId)}>
                    {fact.value}
                  </button>
                ) : (
                  fact.value
                )}
              </dd>
            </div>
          );
        })}
      </dl>
    </aside>
  );
}

function ChroniclePeriodBlock({
  period,
  nav,
}: {
  readonly period: BandChroniclePeriod;
  readonly nav: ChronicleNav;
}) {
  const yearChips = period.yearPageIds
    .filter((id) => nav.isLink(id))
    .slice(0, 8);

  return (
    <section className="chronicle-period">
      <h5>{period.title}</h5>
      {period.paragraphs.map((paragraph) => (
        <ChronicleProse key={paragraph.id} paragraph={paragraph} nav={nav} />
      ))}
      {yearChips.length <= 1 ? null : (
        <div className="chronicle-year-row" aria-label="years in this stretch">
          <span className="chronicle-year-row-label">Year by year</span>
          {yearChips.map((yearId) => (
            <button
              key={yearId}
              type="button"
              className="chronicle-link small"
              onClick={() => nav.openPage(yearId)}
            >
              {(nav.pageMap.get(yearId)?.title ?? yearId).replace("Year ", "Y")}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function ChronicleEvidenceChips({ chips }: { readonly chips: BandChronicleDeepHistorySummary["eras"][number]["evidenceChips"] }) {
  if (chips.length === 0) {
    return null;
  }

  return (
    <div className="chronicle-evidence-chips" aria-label="grounding evidence">
      {chips.map((chip) => (
        <span key={chip.label} className="chronicle-evidence-chip">{chip.label}</span>
      ))}
    </div>
  );
}

function ChronicleDeepHistoryPanel({ deepHistory }: { readonly deepHistory: BandChronicleDeepHistorySummary }) {
  return (
    <section className="chronicle-deep-history" id="article-long-memory" aria-label="long memory">
      <h4>
        <Icon name="time" />
        <span>Long memory</span>
      </h4>
      <p className="chronicle-prose">{deepHistory.memoryBoundaryLine}</p>

      <div className="chronicle-found-now" aria-label="founding and current comparison">
        <div>
          <span className="chronicle-year-row-label">Founded</span>
          <p>{deepHistory.comparison.foundedLine}</p>
        </div>
        <div>
          <span className="chronicle-year-row-label">Now</span>
          <p>{deepHistory.comparison.nowLine}</p>
        </div>
      </div>
      <p className="chronicle-prose">{deepHistory.comparison.changeLine}</p>
      {deepHistory.comparison.inheritanceLine === undefined ? null : (
        <p className="condition-note">{deepHistory.comparison.inheritanceLine}</p>
      )}
      {deepHistory.comparison.terminalLine === undefined ? null : (
        <p className="condition-note">{deepHistory.comparison.terminalLine}</p>
      )}

      {deepHistory.eras.length === 0 ? null : (
        <div className="chronicle-eras" aria-label="durable era records">
          <span className="chronicle-year-row-label">Durable eras</span>
          {deepHistory.eras.map((era) => (
            <article key={era.id} className="chronicle-era-item">
              <h5>{era.yearRange}: {era.title}</h5>
              <p>{era.summary}</p>
              <ChronicleEvidenceChips chips={era.evidenceChips} />
            </article>
          ))}
        </div>
      )}

      {deepHistory.episodes.length === 0 ? null : (
        <div className="chronicle-deep-episodes" aria-label="durable historical episodes">
          <span className="chronicle-year-row-label">Durable episodes</span>
          {deepHistory.episodes.map((episode) => (
            <article key={episode.id} className="chronicle-deep-episode">
              <div className="chronicle-deep-episode-head">
                <h5>{episode.title}</h5>
                <span>{episode.yearRange}</span>
              </div>
              <p>{episode.summary}</p>
              <ChronicleEvidenceChips chips={episode.evidenceChips} />
            </article>
          ))}
        </div>
      )}

      {deepHistory.inherited.length === 0 ? null : (
        <div className="chronicle-deep-episodes inherited" aria-label="inherited history">
          <span className="chronicle-year-row-label">Inherited, not personally lived</span>
          {deepHistory.inherited.map((episode) => (
            <article key={episode.id} className="chronicle-deep-episode">
              <div className="chronicle-deep-episode-head">
                <h5>{episode.title}</h5>
                <span>{episode.yearRange}</span>
              </div>
              <p>{episode.summary}</p>
              <ChronicleEvidenceChips chips={episode.evidenceChips} />
            </article>
          ))}
        </div>
      )}

      <p className="condition-note">{deepHistory.countsLine}</p>
    </section>
  );
}

function scrollToArticleAnchor(anchorId: string) {
  document.getElementById(anchorId)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function ChronicleArticle({
  chronicle,
  nav,
  onExpand,
}: {
  readonly chronicle: BandChronicleState;
  readonly nav: ChronicleNav;
  readonly onExpand?: () => void;
}) {
  const article = chronicle.article;
  const longStories = chronicle.pages.filter((page) => page.kind === "period");

  return (
    <article className="chronicle-article">
      <header className="chronicle-article-header">
        <div className="chronicle-article-title-row">
          <h3>{chronicle.headline}</h3>
          {onExpand === undefined ? null : (
            <button type="button" className="chronicle-expand" title="Open a wide reading view" onClick={onExpand}>
              <Icon name="knowledge" />
              <span>Reading view</span>
            </button>
          )}
        </div>
        <p className="chronicle-era">{chronicle.currentEra}</p>
      </header>

      <ChronicleInfobox chronicle={chronicle} nav={nav} />

      <div className="chronicle-lead">
        {article.leadParagraphs.map((paragraph) => (
          <ChronicleProse key={paragraph.id} paragraph={paragraph} nav={nav} />
        ))}
      </div>

      {/* Century-scale story: the long view from durable signals, told before
          the bounded recent record so a hundred years feels like a hundred. */}
      {article.longStory.length === 0 ? null : (
        <div className="chronicle-lead chronicle-long-story">
          {article.longStory.map((paragraph) => (
            <ChronicleProse key={paragraph.id} paragraph={paragraph} nav={nav} />
          ))}
        </div>
      )}

      {article.deepHistory === undefined ? null : (
        <ChronicleDeepHistoryPanel deepHistory={article.deepHistory} />
      )}

      {article.deepHistory !== undefined || article.eras.length === 0 ? null : (
        <div className="chronicle-eras" aria-label="broad eras of this band">
          {article.eras.map((era) => (
            <div key={era.id} className="chronicle-era-item">
              <h5>{era.title}</h5>
              <p>{era.summary}</p>
            </div>
          ))}
        </div>
      )}

      {article.contents.length <= 1 ? null : (
        <nav className="chronicle-contents" aria-label="article contents">
          <span className="chronicle-contents-label">Contents</span>
          {article.contents.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className="chronicle-link small"
              onClick={() => scrollToArticleAnchor(`article-${entry.id}`)}
            >
              {entry.title}
            </button>
          ))}
        </nav>
      )}

      <section className="chronicle-history" id="article-history">
        <h4>History</h4>
        {article.periods.length === 0 ? (
          <p className="chronicle-prose">The band does not have enough recorded years for a history yet.</p>
        ) : (
          (() => {
            // Newest first: the current stretch is what the reader came for;
            // older stretches expand on demand. Detail this fine survives only
            // for the recent window — say so instead of looking broken.
            const newestFirst = [...article.periods].reverse();
            const latest = newestFirst[0];
            const earlier = newestFirst.slice(1);

            return (
              <div className="chronicle-period-list" aria-label="Recent years">
                {article.coverageNote === undefined ? null : (
                  <p className="condition-note">{article.coverageNote}</p>
                )}
                {latest === undefined ? null : <ChroniclePeriodBlock period={latest} nav={nav} />}
                {earlier.length === 0 ? null : (
                  <CollapsibleGroup title={`Show earlier years (${earlier.length} more stretch${earlier.length === 1 ? "" : "es"})`}>
                    <div className="chronicle-period-list">
                      {earlier.map((period) => (
                        <ChroniclePeriodBlock key={period.id} period={period} nav={nav} />
                      ))}
                    </div>
                  </CollapsibleGroup>
                )}
              </div>
            );
          })()
        )}
        {longStories.length === 0 ? null : (
          <nav className="chronicle-links chronicle-long-stories" aria-label="Major arcs">
            <span className="chronicle-year-row-label">The long stories</span>
            {longStories.map((page) => (
              <button key={page.id} type="button" className="chronicle-link" title={page.title} onClick={() => nav.openPage(page.id)}>
                <Icon name="route" />
                <span>{page.title}</span>
              </button>
            ))}
          </nav>
        )}
      </section>

      {article.sections.map((section) => {
        const meta = SECTION_META[section.id];
        return (
          <section key={section.id} className="chronicle-theme-section" id={`article-${section.id}`}>
            <h4>
              {meta === undefined ? null : <Icon name={meta.icon} />}
              <span>{section.title}</span>
            </h4>
            {section.paragraphs.map((paragraph) => (
              <ChronicleProse key={paragraph.id} paragraph={paragraph} nav={nav} />
            ))}
          </section>
        );
      })}
    </article>
  );
}

function ChroniclePageView({
  chronicle,
  page,
  nav,
  backLabel,
  onBack,
}: {
  readonly chronicle: BandChronicleState;
  readonly page: BandChroniclePage;
  readonly nav: ChronicleNav;
  readonly backLabel: string;
  readonly onBack: () => void;
}) {
  return (
    <article className="chronicle-page">
      <button type="button" className="chronicle-back" onClick={onBack}>
        ← {backLabel}
      </button>
      <header className="chronicle-page-header">
        <span className="chronicle-page-kind">
          <Icon name={PAGE_KIND_ICON[page.kind]} />
        </span>
        <div>
          <h3>{page.title}</h3>
          {page.subtitle === undefined ? null : <p className="chronicle-page-subtitle">{page.subtitle}</p>}
        </div>
      </header>
      {page.facts.length === 0 ? null : (
        <dl className="chronicle-page-facts">
          {page.facts.map((fact) => (
            <div key={fact.label} className="chronicle-infobox-row">
              <dt>{fact.label}</dt>
              <dd title={fact.value}>{fact.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {page.paragraphs.map((paragraph) => (
        <ChronicleProse key={paragraph.id} paragraph={paragraph} nav={nav} />
      ))}
      {page.relatedLinkIds.length === 0 ? null : (
        <div className="chronicle-related">
          <span className="chronicle-year-row-label">Related</span>
          <ChronicleLinkChips chronicle={chronicle} linkIds={page.relatedLinkIds} nav={nav} />
        </div>
      )}
    </article>
  );
}

// --- Legacy record lists (kept, but collapsed under the article) --------------

function RecordsAndLogs({
  band,
  world,
  latestDecision,
  timeline,
  eventFilter,
  onEventFilter,
}: {
  readonly band: Band;
  readonly world: WorldState | null;
  readonly latestDecision: Decision | undefined;
  readonly timeline: readonly TimelineItem[];
  readonly eventFilter: ReadableEventFilter;
  readonly onEventFilter: (filter: ReadableEventFilter) => void;
}) {
  const placesKnown = Object.keys(band.placeMemory).length;
  const favoriteSpots = Object.values(band.placeMemory).filter((memory) => memory.isReturnPlace).length;
  const knownRoutes = Object.keys(band.travelCorridors).length;
  const knownCrossings = Object.keys(band.crossingMemories).length;

  return (
    <section className="bp-section">
      <SectionHeading icon="knowledge">Records and logs</SectionHeading>
      <CollapsibleGroup title="Story so far">
        {timeline.length === 0 ? (
          <p className="empty-panel">Nothing notable has happened yet.</p>
        ) : (
          <ol className="timeline">
            {timeline.map((item) => (
              <li key={item.key} className="timeline-item">
                <span className={item.tone === undefined ? "timeline-icon" : `timeline-icon tone-${item.tone}`}>
                  <Icon name={item.icon} />
                </span>
                <div className="timeline-body">
                  <span className="timeline-title">{item.title}</span>
                  {item.detail === undefined ? null : (
                    <span className="timeline-detail">{item.detail}</span>
                  )}
                </div>
                <span className="timeline-when">{item.when}</span>
              </li>
            ))}
          </ol>
        )}
      </CollapsibleGroup>
      <CollapsibleGroup title="Recent events">
        <ReadableEventList band={band} filter={eventFilter} onFilter={onEventFilter} />
      </CollapsibleGroup>
      <CollapsibleGroup title="Latest decision">
        {latestDecision === undefined ? (
          <p className="empty-panel">No decision made yet.</p>
        ) : (
          <>
            <p className="decision-plain">
              <strong>{ACTION_TEXT[latestDecision.action.type] ?? humanize(latestDecision.action.type)}</strong>
              <span className="decision-why">Why: {reasonLabel(latestDecision.primaryReason.type)}</span>
            </p>
            <DecisionDetails decision={latestDecision} />
          </>
        )}
      </CollapsibleGroup>
      <CollapsibleGroup title={`Places they know (${placesKnown} known, ${favoriteSpots} favorites, ${knownRoutes} routes, ${knownCrossings} crossings)`}>
        <PlaceMemoryDetails band={band} currentTileId={band.position} />
        <CorridorDetails corridors={Object.values(band.travelCorridors)} />
        <RiverCrossingDetails band={band} world={world} latestDecision={latestDecision} />
      </CollapsibleGroup>
      <CollapsibleGroup title="Movement &amp; relocation log">
        <MovementHistoryDetails band={band} />
        <ResidentialMoveDetails band={band} />
      </CollapsibleGroup>
    </section>
  );
}

export function History({
  band,
  world,
  latestDecision,
  requestedPageId,
  onRequestedPageHandled,
}: {
  readonly band: Band;
  readonly world: WorldState | null;
  readonly latestDecision: Decision | undefined;
  /** Cross-tab wiki link request (e.g. a referent card in Food). */
  readonly requestedPageId?: string | null;
  readonly onRequestedPageHandled?: () => void;
}) {
  const [eventFilter, setEventFilter] = useState<ReadableEventFilter>("all");
  const [pageStack, setPageStack] = useState<readonly string[]>([]);
  const [readingView, setReadingView] = useState(false);
  const setSelectedBandId = useSimulationStore((state) => state.setSelectedBandId);
  const setSelectedActivityTripId = useSimulationStore((state) => state.setSelectedActivityTripId);
  const setSelectedTileId = useSimulationStore((state) => state.setSelectedTileId);
  const currentTick = Number(world?.time.tick ?? 0);
  const timeline = useMemo(() => buildTimeline(band, currentTick), [band, currentTick]);
  const chronicle = useMemo(() => (world === null ? undefined : deriveBandChronicle(world, band)), [band, world]);
  const pageMap = useMemo(
    () => new Map((chronicle?.pages ?? []).map((page) => [page.id, page])),
    [chronicle],
  );
  const bandLinkIds = useMemo(
    () => new Set(
      (chronicle?.linkTargets ?? [])
        .filter((target) => target.kind === "band" && target.inactiveFutureHook !== true)
        .map((target) => target.id),
    ),
    [chronicle],
  );

  useEffect(() => {
    setPageStack([]);
    setReadingView(false);
  }, [band.id]);

  // Consume a cross-tab page request once the chronicle is available; if the
  // requested page does not resolve, the reader simply lands on the article.
  useEffect(() => {
    if (requestedPageId === undefined || requestedPageId === null || chronicle === undefined) {
      return;
    }

    if (pageMap.has(requestedPageId)) {
      setPageStack([requestedPageId]);
    }
    onRequestedPageHandled?.();
  }, [requestedPageId, chronicle, pageMap, onRequestedPageHandled]);

  useEffect(() => {
    if (!readingView) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setReadingView(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [readingView]);

  const nav: ChronicleNav = useMemo(() => ({
    pageMap,
    isLink: (linkId: string) => pageMap.has(linkId) || bandLinkIds.has(linkId),
    openPage: (linkId: string) => {
      if (pageMap.has(linkId)) {
        setPageStack((previous) => [...previous.slice(-7), linkId]);
        return;
      }

      const target = chronicle?.linkTargets.find((entry) => entry.id === linkId && entry.inactiveFutureHook !== true);
      if (target !== undefined && target.kind === "band" && target.targetBandId !== undefined) {
        setSelectedBandId(target.targetBandId);
        setSelectedActivityTripId(null);
        setSelectedTileId(null);
      }
    },
  }), [pageMap, bandLinkIds, chronicle, setSelectedBandId, setSelectedActivityTripId, setSelectedTileId]);

  const currentPageId = pageStack[pageStack.length - 1];
  const currentPage = currentPageId === undefined ? undefined : pageMap.get(currentPageId);
  const previousPageId = pageStack[pageStack.length - 2];
  const backLabel = previousPageId === undefined
    ? "Back to the article"
    : pageMap.get(previousPageId)?.title ?? "Back";

  return (
    <div className="bp-history">
      {chronicle !== undefined && currentPage !== undefined ? (
        <section className="bp-section">
          <ChroniclePageView
            chronicle={chronicle}
            page={currentPage}
            nav={nav}
            backLabel={backLabel}
            onBack={() => setPageStack((previous) => previous.slice(0, -1))}
          />
        </section>
      ) : null}

      {chronicle !== undefined && currentPage === undefined ? (
        <section className="bp-section">
          <ChronicleArticle chronicle={chronicle} nav={nav} onExpand={() => setReadingView(true)} />
        </section>
      ) : null}

      {/* Floating reading view: the same article and page router, but at a
          comfortable reading width over the map. Mounted only while open. */}
      {chronicle !== undefined && readingView ? (
        <div className="chronicle-overlay" role="dialog" aria-modal="true" aria-label="chronicle reading view">
          <div className="chronicle-overlay-backdrop" onClick={() => setReadingView(false)} />
          <div className="chronicle-overlay-panel">
            <div className="chronicle-overlay-bar">
              <span className="chronicle-overlay-title">{band.name} — Chronicle</span>
              <button type="button" className="chronicle-overlay-close" onClick={() => setReadingView(false)}>
                Close
              </button>
            </div>
            <div className="chronicle-overlay-body">
              {currentPage !== undefined ? (
                <ChroniclePageView
                  chronicle={chronicle}
                  page={currentPage}
                  nav={nav}
                  backLabel={backLabel}
                  onBack={() => setPageStack((previous) => previous.slice(0, -1))}
                />
              ) : (
                <ChronicleArticle chronicle={chronicle} nav={nav} />
              )}
            </div>
          </div>
        </div>
      ) : null}

      {currentPage === undefined ? (
        <>
          <MemoryReferentSection
            band={band}
            world={world}
            title="Concrete referents in this chronicle"
            icon="memory"
            tab="chronicle"
            limit={6}
          />

          <RecordsAndLogs
            band={band}
            world={world}
            latestDecision={latestDecision}
            timeline={timeline}
            eventFilter={eventFilter}
            onEventFilter={setEventFilter}
          />
        </>
      ) : null}
    </div>
  );
}

function ReadableEventList({
  band,
  filter,
  onFilter,
}: {
  readonly band: Band;
  readonly filter: ReadableEventFilter;
  readonly onFilter: (filter: ReadableEventFilter) => void;
}) {
  const history = band.eventHistory;
  const events = useMemo(
    () => history?.recentEvents.filter((event) => filter === "all" || event.category === filter) ?? [],
    [filter, history],
  );

  if (history === undefined) {
    return <p className="empty-panel">No selected-band events recorded yet.</p>;
  }

  return (
    <>
      <div className="talk-filter-row" role="list" aria-label="recent event filters">
        {READABLE_EVENT_FILTERS.map((entry) => (
          <button
            key={entry.key}
            type="button"
            className={filter === entry.key ? "talk-filter-button active" : "talk-filter-button"}
            onClick={() => onFilter(entry.key)}
          >
            {entry.label}
          </button>
        ))}
      </div>
      {events.length === 0 ? (
        <p className="empty-panel">No grounded events match this filter.</p>
      ) : (
        <ol className="timeline">
          {events.slice(0, 14).map((event) => (
            <li key={String(event.eventId)} className="timeline-item">
              <span className={`timeline-icon tone-${toneForReadableEvent(event)}`}>
                <Icon name={iconForReadableEvent(event)} />
              </span>
              <div className="timeline-body">
                <span className="timeline-title">{event.title}</span>
                <span className="timeline-detail">{event.description}</span>
                <span className="timeline-detail">{event.salience} · {humanize(event.category)}</span>
              </div>
              <span className="timeline-when">{cap(event.season)} · Y{event.year}</span>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

function describeMovementHistory(intentKind: string | undefined): Pick<TimelineItem, "icon" | "title" | "detail"> {
  switch (intentKind) {
    case "local_foraging":
      return { icon: "camp", title: "Shifted within familiar ground", detail: "Kept daily work near camp" };
    case "follow_river_corridor":
      return { icon: "route", title: "Followed the river edge", detail: "Used a known corridor" };
    case "probe_wetland_or_lake":
      return { icon: "water", title: "Checked wet ground", detail: "Scouted water-rich country" };
    case "probe_coast":
      return { icon: "scout", title: "Checked the coast", detail: "Tested shore country" };
    case "seek_better_water":
      return { icon: "water", title: "Moved for better water", detail: "Water pressure shaped the move" };
    case "return_to_known_good_area":
      return { icon: "return", title: "Returned to trusted ground", detail: "Moved back toward a remembered place" };
    case "seek_new_range":
    case "frontier_dispersal":
    case "daughter_range_expansion":
      return { icon: "founding", title: "Pushed toward a new range", detail: intentLabel(intentKind) };
    case "avoid_risk":
      return { icon: "risk", title: "Moved away from risk", detail: "Avoided remembered danger" };
    case "cross_pass":
      return { icon: "route", title: "Crossed the pass", detail: "Used a highland route" };
    case "expand_known_world":
      return { icon: "scout", title: "Expanded known country", detail: "Scouted beyond the usual circuit" };
    default:
      return { icon: "move", title: "Moved camp", detail: intentKind === undefined ? undefined : intentLabel(intentKind) };
  }
}

function describeResidentialMove(
  moveKind: string,
  cause: string,
  distanceTiles: number,
  durationDays: number,
): Pick<TimelineItem, "icon" | "title" | "detail"> {
  const distance = `${distanceTiles} tile${distanceTiles === 1 ? "" : "s"}`;
  const duration = `${durationDays} day${durationDays === 1 ? "" : "s"}`;

  switch (cause) {
    case "water_stress":
      return { icon: "water", title: "Shifted camp for water", detail: `${distance} over ${duration}` };
    case "poor_return":
      return { icon: "food", title: "Left a weak camp", detail: `${distance} after poor returns` };
    case "local_pressure":
      return { icon: "pressure", title: "Eased local pressure", detail: `${distance} camp shift` };
    case "known_opportunity":
      return { icon: "memory", title: "Moved toward a known place", detail: `${distance} from remembered opportunity` };
    case "fission_daughter":
      return { icon: "lineage", title: "Made room for a daughter band", detail: `${distance} separation` };
    case "frontier_intent":
      return { icon: "founding", title: "Shifted toward the edge", detail: `${distance} frontier probe` };
    case "seasonal_refuge_future":
      return { icon: "route", title: "Moved toward seasonal refuge", detail: `${distance} over ${duration}` };
    default:
      return { icon: "settle", title: humanize(moveKind), detail: `${humanize(cause)} · ${distance}` };
  }
}

function describeFissionEvent(splitReason: string): Pick<TimelineItem, "icon" | "title" | "detail"> {
  switch (splitReason) {
    case "split_group_sought_new_range":
      return { icon: "founding", title: "A daughter range began", detail: "A split group sought its own country" };
    case "household_crowding":
      return { icon: "pressure", title: "A crowded band divided", detail: "Household pressure made a split viable" };
    case "leadership_stress":
      return { icon: "lineage", title: "A new branch split off", detail: "Internal strain pushed the branch apart" };
    default:
      return { icon: "fission", title: "A daughter band split off", detail: reasonLabel(splitReason) };
  }
}

function iconForReadableEvent(event: BandReadableEvent): IconName {
  switch (event.category) {
    case "survival":
      return event.rawSource.includes("water") ? "water" : "food";
    case "demography":
      return "people";
    case "movement":
      return "route";
    case "activity":
      return "activity";
    case "adaptation":
      return "activity";
    case "body_logistics":
      return "status";
    case "relationship_memory":
      return "memory";
    case "weak_band_fate":
      return "warning";
    case "death_memory":
      return "memory";
    case "inner_fission":
      return "fission";
    case "social_tension":
    case "access_norms":
      return "talk";
    case "lineage":
      return "lineage";
    case "camp_place":
      return "camp";
    case "resource_ecology":
      return "activity";
    case "nature":
      return "animal";
  }
}

function toneForReadableEvent(event: BandReadableEvent): StatusTone {
  switch (event.salience) {
    case "high":
      return "struggling";
    case "medium":
      return "moving";
    case "low":
      return "settled";
  }
}
