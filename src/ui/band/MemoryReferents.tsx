import { useMemo } from "react";

import { deriveMemoryReferents } from "../../sim/agents/memoryReferents";
import type { MemoryReferent, MemoryReferentKind, MemoryReferentState, MemoryReferentTab } from "../../sim/agents/memoryReferents";
import type { Band } from "../../sim/agents/types";
import type { WorldState } from "../../sim/world/types";

import { Icon } from "../icons";
import type { IconName } from "../icons";
import type { StatusTone } from "../bandSummary";
import { Chip, CollapsibleGroup, SectionHeading } from "./parts";

const KIND_ICON: Readonly<Record<MemoryReferentKind, IconName>> = {
  weather_episode: "season",
  food_patch: "food",
  resource_place: "gathering",
  animal_sign: "animal",
  aquatic_place: "fishing",
  forest_place: "region",
  camp_place: "camp",
  route: "route",
  crossing: "ford",
  accident: "warning",
  sickness_source: "risk",
  gear_material_issue: "storage",
  access_place: "talk",
  talk_source: "talk",
  event_source: "memory",
  social_relation: "people",
};

export function memoryReferentLinkDomId(referentId: string): string {
  return `chronicle-${`referent:${referentId}`.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

export function useMemoryReferents(world: WorldState | null, band: Band): MemoryReferentState | undefined {
  return useMemo(() => (world === null ? undefined : deriveMemoryReferents(world, band)), [band, world]);
}

export function MemoryReferentSection({
  band,
  world,
  title,
  icon = "memory",
  kinds,
  tab,
  limit = 5,
  empty,
  showNotices = false,
  compact = false,
  onOpenChronicle,
}: {
  readonly band: Band;
  readonly world: WorldState | null;
  readonly title: string;
  readonly icon?: IconName;
  readonly kinds?: readonly MemoryReferentKind[];
  readonly tab?: MemoryReferentTab;
  readonly limit?: number;
  readonly empty?: string;
  readonly showNotices?: boolean;
  readonly compact?: boolean;
  /** Cross-tab wiki link: opens this referent's Chronicle page when provided. */
  readonly onOpenChronicle?: (pageId: string) => void;
}) {
  const state = useMemoryReferents(world, band);
  // 1C — the section shows the strongest memories, but every remembered thing
  // stays reachable: the rest live behind "Show all", not nowhere.
  const allGroups = selectReferentGroups(state, kinds, tab);
  const groups = allGroups.slice(0, limit);
  const remaining = allGroups.slice(limit);

  if (state === undefined) {
    return null;
  }

  if (groups.length === 0 && empty === undefined) {
    return null;
  }

  return (
    <section className="bp-section memory-referent-section">
      <SectionHeading icon={icon}>{title}</SectionHeading>
      {showNotices && state.compressedNotices.length > 0 ? (
        <div className="memory-referent-notices">
          {state.compressedNotices.map((notice) => (
            <p key={notice}>{notice}</p>
          ))}
        </div>
      ) : null}
      {groups.length === 0 ? (
        <p className="condition-note">{empty}</p>
      ) : (
        <>
          <MemoryReferentCards groups={groups} compact={compact} onOpenChronicle={onOpenChronicle} />
          {remaining.length === 0 ? null : (
            <CollapsibleGroup title={`Show all remembered things (${allGroups.length})`}>
              <MemoryReferentCards groups={remaining} compact={compact} onOpenChronicle={onOpenChronicle} />
            </CollapsibleGroup>
          )}
        </>
      )}
    </section>
  );
}

export function MemoryReferentCards({
  groups,
  compact = false,
  onOpenChronicle,
}: {
  readonly groups: readonly ReferentGroup[];
  readonly compact?: boolean;
  readonly onOpenChronicle?: (pageId: string) => void;
}) {
  return (
    <div className={compact ? "memory-referent-list compact" : "memory-referent-list"}>
      {groups.map((group) => (
        <MemoryReferentCard
          key={group.referent.id}
          referent={group.referent}
          alikeCount={group.alikeCount}
          compact={compact}
          onOpenChronicle={onOpenChronicle}
        />
      ))}
    </div>
  );
}

/*
 * WHOLE-UI-READABILITY-HISTORY-FUN-1B — several referents can carry the same
 * player-facing title ("wetland aquatic food" at three spots). One card
 * represents them, with a count; nothing is deleted, Technical keeps all.
 */
export interface ReferentGroup {
  readonly referent: MemoryReferent;
  alikeCount: number;
}

function selectReferentGroups(
  state: MemoryReferentState | undefined,
  kinds: readonly MemoryReferentKind[] | undefined,
  tab: MemoryReferentTab | undefined,
): readonly ReferentGroup[] {
  if (state === undefined) {
    return [];
  }
  const kindSet = kinds === undefined ? undefined : new Set(kinds);
  const filtered = state.referents
    .filter((referent) => kindSet === undefined || kindSet.has(referent.kind))
    .filter((referent) => tab === undefined || referent.sourceTabs.includes(tab));
  const groups = new Map<string, ReferentGroup>();

  for (const referent of filtered) {
    // 1C — theme fold: same kind at the same place is one memory to the
    // player even when generated titles differ slightly.
    const key = `${referent.kind}:${(referent.placeLabel ?? referent.title).toLowerCase()}`;
    const existing = groups.get(key);

    if (existing === undefined) {
      groups.set(key, { referent, alikeCount: 0 });
    } else {
      existing.alikeCount += 1;
    }
  }

  return [...groups.values()];
}

function MemoryReferentCard({
  referent,
  compact,
  alikeCount = 0,
  onOpenChronicle,
}: {
  readonly referent: MemoryReferent;
  readonly compact: boolean;
  readonly alikeCount?: number;
  readonly onOpenChronicle?: (pageId: string) => void;
}) {
  const tone = toneForReferent(referent);
  const related = relatedSummary(referent);

  return (
    <details
      id={memoryReferentLinkDomId(referent.id)}
      className={compact ? `memory-referent-card compact tone-${tone}` : `memory-referent-card tone-${tone}`}
    >
      <summary>
        <span className="memory-referent-icon">
          <Icon name={KIND_ICON[referent.kind]} />
        </span>
        <span className="memory-referent-summary">
          <span className="memory-referent-title">{referent.title}</span>
          <span className="memory-referent-line">{referent.summary}</span>
        </span>
        <span className="memory-referent-chip-row">
          <Chip tone={tone}>{referent.status}</Chip>
        </span>
      </summary>
      <div className="memory-referent-body">
        <div className="memory-referent-meta">
          {referent.placeLabel === undefined ? null : <span>{referent.placeLabel}</span>}
          {referent.year === undefined ? null : (
            <span>
              {referent.season === undefined ? "Year" : capitalize(referent.season)} Y{referent.year}
            </span>
          )}
          {referent.recurrence === undefined ? null : <span>{referent.recurrence}</span>}
          <span>{referent.confidenceWord}</span>
          <span>{freshnessLabel(referent.freshness)}</span>
          {alikeCount === 0 ? null : (
            <span title="Similar memories were folded into this card">
              {alikeCount} similar {alikeCount === 1 ? "memory" : "memories"} folded in
            </span>
          )}
        </div>
        <p className="memory-referent-response">{referent.currentResponse}</p>
        {referent.consequences.length === 0 ? null : (
          <ul className="memory-referent-consequences">
            {referent.consequences.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
        {related.length === 0 ? null : (
          <div className="memory-referent-related">
            {related.map((line) => (
              <span key={line}>{line}</span>
            ))}
          </div>
        )}
        {onOpenChronicle === undefined ? null : (
          <button
            type="button"
            className="chronicle-link small"
            title="Open this memory in the Chronicle"
            onClick={() => onOpenChronicle(`referent:${referent.id}`)}
          >
            Read in the Chronicle
          </button>
        )}
        <p className="memory-referent-proof-note">Raw source ids and scoring proof are kept in Technical.</p>
      </div>
    </details>
  );
}

function relatedSummary(referent: MemoryReferent): readonly string[] {
  return [
    countLine(referent.relatedEventIds.length, "event"),
    countLine(referent.relatedTalkIds.length, "talk theme"),
    countLine(referent.relatedPlaceIds.length, "place"),
    countLine(referent.relatedResourceIds.length, "resource"),
    countLine(referent.relatedRouteIds.length, "route"),
    countLine(referent.relatedBandIds.length, "band"),
  ].filter((line): line is string => line !== undefined);
}

function countLine(count: number, label: string): string | undefined {
  if (count === 0) {
    return undefined;
  }
  return `${count} related ${label}${count === 1 ? "" : "s"}`;
}

function toneForReferent(referent: MemoryReferent): StatusTone {
  if (
    referent.kind === "accident" ||
    referent.kind === "sickness_source" ||
    referent.freshness === "worsening" ||
    /failing|severe|risk|overused|sickness|accident|emergency/i.test(`${referent.status} ${referent.summary}`)
  ) {
    return "struggling";
  }
  if (referent.freshness === "recovering" || referent.freshness === "stale") {
    return "moving";
  }
  return "settled";
}

function freshnessLabel(freshness: MemoryReferent["freshness"]): string {
  switch (freshness) {
    case "current":
      return "current";
    case "recent":
      return "recent";
    case "repeated":
      return "repeated";
    case "stale":
      return "stale";
    case "recovering":
      return "recovering";
    case "worsening":
      return "worsening";
    case "uncertain":
      return "uncertain";
  }
}

function capitalize(value: string): string {
  return value.length === 0 ? value : value.charAt(0).toUpperCase() + value.slice(1);
}
