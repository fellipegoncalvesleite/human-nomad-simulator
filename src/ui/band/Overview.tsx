import { useMemo } from "react";

import type { Band } from "../../sim/agents/types";
import type { StepMode, TickNumber } from "../../sim/core/types";
import type { Tile } from "../../sim/world/types";
import type { WorldState } from "../../sim/world/types";

import { Icon } from "../icons";
import type { IconName } from "../icons";
import { deriveCondition } from "../bandSummary";
import type { StatusTone } from "../bandSummary";
import { moodLabel } from "../labels";
import { deriveOverviewLead, derivePlayerStory, similarTheme } from "./playerStory";
import { BandHeadline } from "./BandHeadline";
import { MemoryReferentSection } from "./MemoryReferents";
import { Bar, CauseCard, Chip, CollapsibleGroup, SectionHeading } from "./parts";

/*
 * WHOLE-UI-READABILITY-HISTORY-FUN-1B — the Overview is the band's movie
 * trailer: the headline says who and where, "The short version" says how it is
 * going and what changed, four key facts say what presses and what helps, and
 * everything deeper is one collapsed group away. The headline already shows
 * what they are doing, so nothing here repeats it.
 */

type OverviewJumpTab = "doing" | "survival" | "food" | "nature" | "place" | "people" | "story";

const OVERVIEW_JUMPS: readonly { readonly tab: OverviewJumpTab; readonly label: string; readonly icon: IconName }[] = [
  { tab: "survival", label: "Daily survival", icon: "status" },
  { tab: "food", label: "What they eat", icon: "food" },
  { tab: "place", label: "This place", icon: "camp" },
  { tab: "people", label: "The people", icon: "people" },
  { tab: "story", label: "Chronicle", icon: "memory" },
];

function toneForGood(value: number): StatusTone {
  if (value >= 0.6) {
    return "settled";
  }
  if (value >= 0.35) {
    return "moving";
  }
  return "struggling";
}

function ConditionRow({
  icon,
  label,
  value,
}: {
  readonly icon: IconName;
  readonly label: string;
  readonly value: number;
}) {
  return (
    <div className="condition-row">
      <span className="condition-icon">
        <Icon name={icon} />
      </span>
      <span className="condition-label">{label}</span>
      <Bar value={value} tone={toneForGood(value)} />
    </div>
  );
}

function KeyFactRow({
  icon,
  label,
  value,
}: {
  readonly icon: IconName;
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div className="chronicle-infobox-row">
      <dt>
        <Icon name={icon} />
        <span>{label}</span>
      </dt>
      <dd title={value}>{value}</dd>
    </div>
  );
}

/* One grouped line of camp talk topics; the full feed lives in People. */
function fireTopics(band: Band): readonly string[] {
  const items = band.campRumors?.items ?? [];
  const topics: string[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    const topic = String(item.category).split("_").join(" ");

    if (!seen.has(topic)) {
      seen.add(topic);
      topics.push(topic);
    }

    if (topics.length >= 5) {
      break;
    }
  }

  return topics;
}

export function Overview({
  band,
  world,
  currentTile,
  season,
  currentTick,
  stepMode,
  onNavigateTab,
  onOpenChronicle,
}: {
  readonly band: Band;
  readonly world: WorldState | null;
  readonly currentTile: Tile | undefined;
  readonly season: string;
  readonly currentTick: TickNumber;
  readonly stepMode: StepMode;
  readonly defaultExpanded?: boolean;
  readonly onNavigateTab?: (tab: OverviewJumpTab) => void;
  readonly onOpenChronicle?: (pageId: string) => void;
}) {
  const condition = deriveCondition(band);
  const profile = band.conditionProfile;
  // The story projection is pure band-known state; memoized per snapshot.
  const story = useMemo(
    () => derivePlayerStory(band, currentTick, stepMode),
    [band, currentTick, stepMode],
  );
  const lead = useMemo(() => deriveOverviewLead(band), [band]);
  const topics = fireTopics(band);
  const mainPressure = story.pressures[0] ?? "Nothing weighs on them sharply right now.";
  const mainHelp = story.supports[0] ?? "No single thing is carrying them.";
  // 1C — dedupe by theme, not exact text: the risk row must add something
  // beyond the pressure row, and the trailer must not restate its own
  // headline sentence in different words.
  const mainRisk =
    [story.whyHere.pressures[0], story.pressures[1], story.whyHere.pressures[1]]
      .find((candidate) => candidate !== undefined && !similarTheme(candidate, mainPressure)) ??
    "No sharp risk stands out beyond the main pressure.";
  const survivalLine =
    profile !== undefined && !similarTheme(profile.survivalCondition, lead.status)
      ? profile.survivalCondition
      : undefined;
  const changeLine =
    lead.change !== undefined && !similarTheme(lead.change, lead.status)
      ? lead.change
      : undefined;

  return (
    <div className="bp-overview">
      <BandHeadline
        band={band}
        currentTile={currentTile}
        season={season}
        currentTick={currentTick}
        stepMode={stepMode}
      />

      <section className="bp-section">
        <SectionHeading icon="status">The short version</SectionHeading>
        <div className="story-block">
          <strong>{lead.status}</strong>
          {survivalLine === undefined ? null : <p>{survivalLine}</p>}
          {changeLine === undefined ? null : <p>{changeLine}</p>}
        </div>
        <div className="chronicle-infobox overview-key-facts">
          <span className="chronicle-year-row-label">Key facts</span>
          <dl>
            <KeyFactRow icon="status" label="Mood" value={moodLabel(band.disposition?.dominantMood)} />
            <KeyFactRow icon="pressure" label="Main pressure" value={mainPressure} />
            <KeyFactRow icon="food" label="Main help" value={mainHelp} />
            <KeyFactRow icon="risk" label="Main risk" value={mainRisk} />
          </dl>
        </div>
        {onNavigateTab === undefined ? null : (
          <nav className="jump-links" aria-label="where to look next">
            <span className="chronicle-year-row-label">Where to look next</span>
            {OVERVIEW_JUMPS.map((jump) => (
              <button
                key={jump.tab}
                type="button"
                className="chronicle-link"
                title={jump.label}
                onClick={() => onNavigateTab(jump.tab)}
              >
                <Icon name={jump.icon} />
                <span>{jump.label}</span>
              </button>
            ))}
          </nav>
        )}
      </section>

      {story.happened.length === 0 ? null : (
        <section className="bp-section">
          <SectionHeading icon="season">What happened recently</SectionHeading>
          <ol className="recent-events">
            {story.happened.slice(0, 2).map((event) => (
              <li key={event.id} className={`recent-event tone-${event.salience === "high" ? "struggling" : event.salience === "medium" ? "moving" : "settled"}`}>
                <span className="recent-event-title">{event.title}</span>
                <span className="recent-event-desc">{event.description}</span>
                <span className="recent-event-when">{event.when}</span>
              </li>
            ))}
          </ol>
          <p className="condition-note">The full history lives in the Chronicle tab.</p>
        </section>
      )}

      {/* Core status stays visible — the bars are the fastest "are they okay". */}
      <section className="bp-section">
        <SectionHeading icon="status">Condition</SectionHeading>
        <div className="condition-grid">
          <ConditionRow icon="food" label={condition.foodLabel} value={condition.bars.food} />
          <ConditionRow icon="water" label={condition.waterLabel} value={condition.bars.water} />
          <ConditionRow icon="status" label={condition.viabilityLabel} value={condition.bars.safety} />
        </div>
        <p className="condition-note">{condition.crowdingLabel}</p>
      </section>

      <section className="bp-section">
        <SectionHeading icon="knowledge">More context</SectionHeading>
        <CollapsibleGroup title="Why this place, what they remember, camp talk">
          <CauseCard
            title={story.whyHere.title}
            because={story.whyHere.because}
            pressures={story.whyHere.pressures}
            note="Grounded in this band's own memory of the place — see Place for detail, Technical for proof."
          />

          <MemoryReferentSection
            band={band}
            world={world}
            title="Concrete things they remember"
            icon="memory"
            tab="overview"
            limit={4}
            compact
            empty="Nothing they remember stands out sharply yet."
            onOpenChronicle={onOpenChronicle}
          />

          {topics.length === 0 ? null : (
            <p className="condition-note">Around the fire, talk runs to {topics.join(", ")} — the voices live in People.</p>
          )}

          {(story.supports.length === 0 && story.pressures.length === 0) ? null : (
            <div className="support-pressure">
              {story.supports.map((line) => (
                <Chip key={line} icon="food" tone="settled">
                  {line}
                </Chip>
              ))}
              {story.pressures.map((line) => (
                <Chip key={line} icon="pressure" tone="struggling">
                  {line}
                </Chip>
              ))}
            </div>
          )}
        </CollapsibleGroup>
      </section>
    </div>
  );
}
