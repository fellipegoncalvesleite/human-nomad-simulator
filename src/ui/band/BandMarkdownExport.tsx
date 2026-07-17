import { useEffect, useMemo, useRef, useState } from "react";

import type { Band } from "../../sim/agents/types";
import { derivePublicHumanStoryProfile } from "../../sim/agents/publicHumanStory";
import type { StepMode, TickNumber } from "../../sim/core/types";
import type { Decision } from "../../sim/rules/types";
import type { Tile, WorldState } from "../../sim/world/types";

import { Icon } from "../icons";
import { Affordances } from "./Affordances";
import { CampFootholds } from "./CampFootholds";
import { CampMovement } from "./CampMovement";
import { Doing } from "./Doing";
import { Events } from "./Events";
import { Food } from "./Food";
import { History } from "./History";
import { Identity } from "./Identity";
import { Knowledge } from "./Knowledge";
import { Nature } from "./Nature";
import { Overview } from "./Overview";
import { People } from "./People";
import { Place } from "./Place";
import { PracticeFeedback } from "./PracticeFeedback";
import { BetweenBands } from "./BetweenBands";
import { IdeasSolutions } from "./IdeasSolutions";
import { ProblemsAndTrials } from "./ProblemsAndTrials";
import { Survival } from "./Survival";
import { Technical } from "./Technical";
import { BAND_DETAIL_VIEWS } from "./views";
import type { BandDetailView } from "./views";

type ExportSectionId = BandDetailView;
const EXPORT_SECTIONS = BAND_DETAIL_VIEWS;

const DEFAULT_SECTION_IDS: readonly ExportSectionId[] = EXPORT_SECTIONS.map((section) => section.id);

const EXPORT_BLOCK_SELECTOR = ".band-headline, .bp-section, .cause-card, .bp-activity, .collapsible";
const TEXT_BLOCK_SELECTOR = [
  "h3",
  "p",
  ".activity-card",
  ".activity-overview",
  ".band-headline-context span",
  ".band-headline-doing",
  ".band-headline-meta span",
  ".band-headline-reason",
  ".band-life-chips > .chip",
  ".cause-card-list > li",
  ".cause-card-note",
  ".condition-row",
  ".decision-plain",
  ".ecology-row",
  ".empty-panel",
  ".life-summary-panel",
  ".nature-card",
  ".recent-event",
  ".skill-group",
  ".stat-tile",
  ".status-chip",
  ".story-block",
  ".human-story-card",
  ".public-story-title",
  ".public-story-line",
  ".support-pressure > .chip",
  ".talk-card",
  ".talk-empty",
  ".talk-group-note",
  ".talk-more-note",
  ".talk-panel-meta",
  ".talk-panel-title",
  ".timeline-item",
  ".tile-detail-row",
  ".trip-talk-line",
].join(",");

const SKIP_TEXT_SELECTOR = [
  "input",
  "script",
  "style",
  "svg",
  "textarea",
  ".bp-section-title",
  ".ecology-expand",
  ".talk-filter-row",
  ".talk-toggle",
].join(",");

export function BandMarkdownExport({
  band,
  world,
  currentTile,
  latestDecision,
  selectedActivityTripId,
  season,
  currentTick,
  stepMode,
}: {
  readonly band: Band;
  readonly world: WorldState | null;
  readonly currentTile: Tile | undefined;
  readonly latestDecision: Decision | undefined;
  readonly selectedActivityTripId: string | null;
  readonly season: string;
  readonly currentTick: TickNumber;
  readonly stepMode: StepMode;
}) {
  const [open, setOpen] = useState(false);
  const [selectedSections, setSelectedSections] = useState<readonly ExportSectionId[]>(
    DEFAULT_SECTION_IDS,
  );
  const [markdown, setMarkdown] = useState("");
  const [sourceRequested, setSourceRequested] = useState(false);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  const sourceRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const selectedKey = selectedSections.join("|");
  const selectedLabels = useMemo(
    () => EXPORT_SECTIONS.filter((section) => selectedSections.includes(section.id)).map((section) => section.label),
    [selectedKey],
  );

  useEffect(() => {
    setSelectedSections(DEFAULT_SECTION_IDS);
    setMarkdown("");
    setSourceRequested(false);
    setCopyStatus("idle");
  }, [band.id]);

  useEffect(() => {
    if (!open || !sourceRequested) {
      return;
    }

    setCopyStatus("idle");
    setMarkdown(
      buildMarkdownFromExportSource({
        root: sourceRef.current,
        band,
        world,
        selectedLabels,
      }),
    );
    setSourceRequested(false);
  }, [
    band,
    currentTile,
    currentTick,
    latestDecision,
    open,
    season,
    selectedActivityTripId,
    selectedKey,
    selectedLabels,
    sourceRequested,
    stepMode,
    world,
  ]);

  function toggleSection(sectionId: ExportSectionId, checked: boolean) {
    setMarkdown("");
    setSourceRequested(false);
    setCopyStatus("idle");
    setSelectedSections((current) => {
      const next = new Set(current);

      if (checked) {
        next.add(sectionId);
      } else {
        next.delete(sectionId);
      }

      return EXPORT_SECTIONS.map((section) => section.id).filter((id) => next.has(id));
    });
  }

  function setAllSections(checked: boolean) {
    setSelectedSections(checked ? DEFAULT_SECTION_IDS : []);
    setMarkdown("");
    setSourceRequested(false);
    setCopyStatus("idle");
  }

  function requestMarkdownGeneration() {
    setMarkdown("");
    setCopyStatus("idle");
    setSourceRequested(true);
  }

  async function copyMarkdown() {
    try {
      if (navigator.clipboard === undefined) {
        throw new Error("Clipboard API unavailable");
      }

      await navigator.clipboard.writeText(markdown);
      setCopyStatus("copied");
    } catch {
      const textarea = textareaRef.current;

      if (textarea === null) {
        setCopyStatus("failed");
        return;
      }

      textarea.select();
      setCopyStatus(document.execCommand("copy") ? "copied" : "failed");
    }
  }

  function downloadMarkdown() {
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `${slugify(band.name)}-band-info.md`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="band-export">
      <button
        type="button"
        className="band-export-open"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Icon name="file" />
        <span>Band info .md</span>
      </button>

      {open ? (
        <div className="band-export-drawer">
          <div className="band-export-head">
            <strong>Band information</strong>
            <div className="band-export-actions">
              <button type="button" onClick={requestMarkdownGeneration} disabled={sourceRequested}>
                <Icon name="file" />
                <span>{sourceRequested ? "Generating" : "Generate .md"}</span>
              </button>
              <button type="button" onClick={copyMarkdown} disabled={markdown.length === 0}>
                <Icon name="copy" />
                <span>{copyStatus === "copied" ? "Copied" : copyStatus === "failed" ? "Copy failed" : "Copy"}</span>
              </button>
              <button type="button" onClick={downloadMarkdown} disabled={markdown.length === 0}>
                <Icon name="download" />
                <span>Download .md</span>
              </button>
            </div>
          </div>

          <div className="band-export-options" aria-label="Markdown sections">
            {EXPORT_SECTIONS.map((section) => (
              <label key={section.id} className="band-export-option">
                <input
                  type="checkbox"
                  checked={selectedSections.includes(section.id)}
                  onChange={(event) => toggleSection(section.id, event.currentTarget.checked)}
                />
                <span>{section.label}</span>
              </label>
            ))}
          </div>

          <div className="band-export-bulk">
            <button type="button" onClick={() => setAllSections(true)}>
              All
            </button>
            <button type="button" onClick={() => setAllSections(false)}>
              Clear
            </button>
          </div>

          <textarea
            ref={textareaRef}
            className="band-export-text"
            value={markdown}
            readOnly
            spellCheck={false}
            aria-label="Band information markdown"
          />

          {sourceRequested ? (
            <div ref={sourceRef} className="band-export-source" hidden>
              {selectedSections.map((sectionId) => {
                const section = EXPORT_SECTIONS.find((entry) => entry.id === sectionId);

                return (
                  <div
                    key={sectionId}
                    data-export-view={sectionId}
                    data-export-label={section?.label ?? sectionId}
                  >
                    {renderExportSection({
                      sectionId,
                      band,
                      world,
                      currentTile,
                      latestDecision,
                      selectedActivityTripId,
                      season,
                      currentTick,
                      stepMode,
                    })}
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function renderExportSection({
  sectionId,
  band,
  world,
  currentTile,
  latestDecision,
  selectedActivityTripId,
  season,
  currentTick,
  stepMode,
}: {
  readonly sectionId: ExportSectionId;
  readonly band: Band;
  readonly world: WorldState | null;
  readonly currentTile: Tile | undefined;
  readonly latestDecision: Decision | undefined;
  readonly selectedActivityTripId: string | null;
  readonly season: string;
  readonly currentTick: TickNumber;
  readonly stepMode: StepMode;
}) {
  switch (sectionId) {
    case "overview":
      return (
        <Overview
          band={band}
          world={world}
          currentTile={currentTile}
          season={season}
          currentTick={currentTick}
          stepMode={stepMode}
          defaultExpanded
        />
      );
    case "doing":
      return (
        <Doing
          band={band}
          world={world}
          selectedActivityTripId={selectedActivityTripId}
          stepMode={stepMode}
          currentTick={currentTick}
        />
      );
    case "survival":
      return <Survival band={band} world={world} />;
    case "food":
      return <Food band={band} world={world} defaultExpanded />;
    case "nature":
      return <Nature band={band} world={world} />;
    case "place":
      return <Place band={band} world={world} currentTick={currentTick} />;
    case "camp":
      return <CampFootholds band={band} world={world} />;
    case "movementCamp":
      return <CampMovement band={band} world={world} />;
    case "people":
      return <People band={band} world={world} defaultExpanded />;
    case "affordances":
      return <Affordances band={band} world={world} />;
    case "problems":
      return <ProblemsAndTrials band={band} world={world} />;
    case "feedback":
      return <PracticeFeedback band={band} world={world} />;
    case "between":
      return <BetweenBands band={band} world={world} />;
    case "ideas":
      return <IdeasSolutions band={band} world={world} />;
    case "knowledge":
      return <Knowledge band={band} world={world} />;
    case "identity":
      return <Identity band={band} world={world} />;
    case "events":
      return <Events band={band} world={world} />;
    case "story":
      return <History band={band} world={world} latestDecision={latestDecision} />;
    case "technical":
      return (
        <Technical
          band={band}
          world={world}
          currentTile={currentTile}
          latestDecision={latestDecision}
        />
      );
  }
}

function buildMarkdownFromExportSource({
  root,
  band,
  world,
  selectedLabels,
}: {
  readonly root: HTMLDivElement | null;
  readonly band: Band;
  readonly world: WorldState | null;
  readonly selectedLabels: readonly string[];
}): string {
  const lines: string[] = [`# ${band.name}`, ""];

  if (world !== null) {
    lines.push(`- Year: ${world.time.year}`);
    lines.push(`- Season: ${capitalize(world.time.season)}`);
    lines.push(`- Tick: ${String(world.time.tick)}`);
  }

  if (selectedLabels.length > 0) {
    lines.push(`- Sections: ${selectedLabels.join(", ")}`);
  }

  lines.push("");

  if (world !== null && shouldExportPublicStories(selectedLabels)) {
    const storyProfile = derivePublicHumanStoryProfile(world, band);
    const stories = [
      ...storyProfile.internalTalks.slice(0, 3),
      ...storyProfile.outerTalks.slice(0, 3),
      ...storyProfile.eventStories.slice(0, 4),
      ...storyProfile.ideaStories.slice(0, 4),
      ...storyProfile.attemptStories.slice(0, 3),
      ...storyProfile.routineStories.slice(0, 3),
      ...storyProfile.campStories.slice(0, 3),
      ...storyProfile.rangeRotationStories.slice(0, 3),
    ].slice(0, 18);

    if (stories.length > 0) {
      lines.push("## Public human stories", "");
      for (const story of stories) {
        lines.push(`- **${story.title}** (${story.status}) - ${story.story}`);
      }
      lines.push("");
    }
  }

  if (root === null || selectedLabels.length === 0) {
    lines.push("_No band sections selected._");
    return finishMarkdown(lines);
  }

  const tabNodes = Array.from(root.querySelectorAll<HTMLElement>("[data-export-view]"));

  for (const tabNode of tabNodes) {
    const label = tabNode.dataset.exportLabel ?? "Band section";

    lines.push(`## ${label}`, "");

    // Expanding every Technical group at once mounts dozens of expensive
    // projections and can exhaust the browser. Keep the on-screen tree lazy,
    // export its complete A-Z group index, and serialize the authoritative raw
    // band state directly instead.
    if (tabNode.dataset.exportView === "technical") {
      const groupTitles = Array.from(
        tabNode.querySelectorAll<HTMLElement>(".collapsible > summary"),
      ).map((summary) => readElementText(summary));

      lines.push("### Technical groups (A-Z)", "");
      for (const groupTitle of groupTitles) {
        lines.push(`- ${groupTitle}`);
      }
      lines.push("", "### Raw band state", "", "```json", JSON.stringify(band, null, 2), "```", "");
      continue;
    }

    const blockNodes = Array.from(tabNode.querySelectorAll<HTMLElement>(EXPORT_BLOCK_SELECTOR)).filter(
      (node) => node.parentElement?.closest(EXPORT_BLOCK_SELECTOR) === null,
    );

    if (blockNodes.length === 0) {
      const text = readElementText(tabNode);

      if (text.length > 0) {
        lines.push(text, "");
      }
      continue;
    }

    for (const block of blockNodes) {
      const heading = headingForBlock(block);
      const blockLines = extractBlockLines(block);

      if (heading !== undefined && heading.length > 0) {
        lines.push(`### ${heading}`);
      }

      if (blockLines.length === 0) {
        const fallback = readElementText(block);

        if (fallback.length > 0 && fallback !== heading) {
          lines.push(`- ${fallback}`);
        }
      } else {
        for (const line of blockLines) {
          if (line !== heading) {
            lines.push(`- ${line}`);
          }
        }
      }

      lines.push("");
    }
  }

  return finishMarkdown(lines);
}

function headingForBlock(block: HTMLElement): string | undefined {
  if (block.classList.contains("collapsible")) {
    return readElementText(block.querySelector<HTMLElement>(":scope > summary"));
  }

  if (block.classList.contains("band-headline")) {
    return "Current headline";
  }

  if (block.classList.contains("cause-card")) {
    return readElementText(block.querySelector<HTMLElement>(".cause-card-title"));
  }

  const directHeading = Array.from(block.children).find((child) =>
    child.classList.contains("bp-section-title"),
  );

  if (directHeading instanceof HTMLElement) {
    return readElementText(directHeading);
  }

  const nestedHeading = block.querySelector<HTMLElement>(".bp-section-title");
  return readElementText(nestedHeading);
}

function extractBlockLines(block: HTMLElement): readonly string[] {
  const lines: string[] = [];
  const candidates = Array.from(block.querySelectorAll<HTMLElement>(TEXT_BLOCK_SELECTOR));

  for (const candidate of candidates) {
    if (candidate.closest(SKIP_TEXT_SELECTOR) !== null) {
      continue;
    }

    const matchingAncestor = candidate.parentElement?.closest(TEXT_BLOCK_SELECTOR);

    if (matchingAncestor !== null && matchingAncestor !== undefined && block.contains(matchingAncestor)) {
      continue;
    }

    const text = readElementText(candidate);

    if (text.length > 0 && lines[lines.length - 1] !== text) {
      lines.push(text);
    }
  }

  return lines;
}

function readElementText(element: Element | null): string {
  if (element === null || element.matches(SKIP_TEXT_SELECTOR)) {
    return "";
  }

  return normalizeText(readNodeText(element).join(" "));
}

function readNodeText(node: Node): readonly string[] {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? "";
    return text.trim().length === 0 ? [] : [text];
  }

  if (!(node instanceof Element) || node.matches(SKIP_TEXT_SELECTOR)) {
    return [];
  }

  return Array.from(node.childNodes).flatMap((child) => readNodeText(child));
}

function normalizeText(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function finishMarkdown(lines: readonly string[]): string {
  return `${lines.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`;
}

function shouldExportPublicStories(selectedLabels: readonly string[]): boolean {
  return selectedLabels.some((label) =>
    label === "Events" ||
    label === "Ideas & Solutions" ||
    label === "Movement & Camp" ||
    label === "Between Bands" ||
    label === "Chronicle");
}

function capitalize(value: string): string {
  return value.length === 0 ? value : value.charAt(0).toUpperCase() + value.slice(1);
}

function slugify(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug.length === 0 ? "band" : slug;
}
