/*
 * READABILITY-UI-ORGANIZATION-1 — the selected band's story, in plain language.
 *
 * Pure projection (no React, no store): builds the exact strings the normal UI
 * renders for "what happened / what are they doing / why", plus compact causal
 * cards. The targeted audit loads this module and scans its output for
 * code-like tokens, so what is checked is literally what the player reads.
 *
 * Anti-omniscience: every line here derives from the band's own state, memory,
 * events, and talk — never from hidden world truth.
 */

import type { Band } from "../../sim/agents/types";
import type { StepMode, TickNumber } from "../../sim/core/types";

import { deriveBandLifeSummary } from "../bandLife";
import { humanize } from "../labels";
import {
  accessStateLabel,
  campStateLabel,
  fallbackLevelLabel,
  hungerClassificationLabel,
  seasonalRoundOutcomeLabel,
} from "./translate";

export interface StoryEventLine {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly salience: "high" | "medium" | "low";
  readonly when: string;
}

export interface CauseCardModel {
  readonly title: string;
  readonly because: readonly string[];
  readonly pressures: readonly string[];
}

export interface PlayerStory {
  readonly condition: string;
  readonly doingNow: string;
  readonly movement: string;
  readonly intent: string;
  readonly why: string;
  readonly happened: readonly StoryEventLine[];
  readonly topTalk: string | undefined;
  readonly whyHere: CauseCardModel;
  readonly supports: readonly string[];
  readonly pressures: readonly string[];
}

function cleanLine(line: string): string {
  return line.replace(/\s+/g, " ").trim();
}

// Strip a trailing raw suffix some sim reason phrases carry ("… : tile:12:8").
function stripRawSuffix(line: string): string {
  return cleanLine(line.replace(/\b(?:tile|band|reason|decision):[a-z0-9:_-]+/gi, "").replace(/[·|]\s*$/, ""));
}

function sentenceCase(line: string): string {
  const cleaned = stripRawSuffix(line);

  if (cleaned.length === 0) {
    return cleaned;
  }

  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function uniqueLines(lines: readonly (string | undefined)[], cap: number): readonly string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const line of lines) {
    if (line === undefined) {
      continue;
    }

    const cleaned = sentenceCase(line);

    if (cleaned.length < 4) {
      continue;
    }

    const key = cleaned.toLowerCase();

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(cleaned);

    if (result.length >= cap) {
      break;
    }
  }

  return result;
}

export function deriveRecentStoryEvents(band: Band, cap = 3): readonly StoryEventLine[] {
  const events = band.eventHistory?.recentEvents ?? [];
  const ranked = [...events].sort((left, right) => {
    const salienceRank = { high: 0, medium: 1, low: 2 } as const;

    if (salienceRank[left.salience] !== salienceRank[right.salience]) {
      return salienceRank[left.salience] - salienceRank[right.salience];
    }

    return right.year * 4 + seasonIndexOf(right.season) - (left.year * 4 + seasonIndexOf(left.season));
  });

  return ranked.slice(0, cap).map((event) => ({
    id: String(event.eventId),
    title: sentenceCase(event.title),
    description: sentenceCase(event.description),
    salience: event.salience,
    when: `${humanize(event.season)} · Year ${event.year}`,
  }));
}

function seasonIndexOf(season: string): number {
  switch (season) {
    case "spring":
      return 0;
    case "summer":
      return 1;
    case "autumn":
      return 2;
    default:
      return 3;
  }
}

// "Why they are here" — grounded in the band's own place/access/round memory.
export function deriveWhyHereCard(band: Band): CauseCardModel {
  const place = band.protoCampMemory?.currentPlace;
  const access = band.protoAccessMemory?.currentPlace;
  const roundOutcome = band.seasonalRoundState?.outcome;
  const because: (string | undefined)[] = [];
  const pressures: (string | undefined)[] = [];

  if (place !== undefined && place.campLikeState !== "none") {
    because.push(campStateLabel(place.campLikeState));
    because.push(...place.topReasons.slice(0, 3));
    pressures.push(...place.negativeReasons.slice(0, 2).map((factor) => factor.reason));
  }

  if (access !== undefined && access.accessState !== "none") {
    because.push(accessStateLabel(access.accessState));
  }

  if (roundOutcome !== undefined && roundOutcome !== "none") {
    because.push(seasonalRoundOutcomeLabel(roundOutcome));
  }

  const weather = band.bodyCampLogistics?.weatherMemories[0];

  if (weather !== undefined && weather.trend !== "recovered") {
    pressures.push(weatherPressureLine(weather.kind));
  }

  return {
    title: "Why this place",
    because: uniqueLines(because, 4),
    pressures: uniqueLines(pressures, 3),
  };
}

function weatherPressureLine(kind: string): string {
  switch (kind) {
    case "bad_crossing_season":
      return "Remembered crossing weather still weighs on route choices";
    case "wet_travel":
      return "Remembered wet travel still makes movement feel costly";
    case "cold_exposure":
      return "Remembered cold exposure keeps fire and shelter pressure visible";
    case "heat_drought":
      return "Remembered dry heat keeps water access central";
    case "dry_water_stress":
      return "Remembered dry water stress keeps them close to known water";
    case "floodplain_wetland":
      return "Remembered flooding ground keeps wetland movement cautious";
    default:
      return "Remembered weather still shapes movement caution";
  }
}

// A "support reason" from the sim can be a signed explanation ("lean season
// reduced effective yield"); showing it under "helping them" reads as a bug.
// Partition by wording so negative explanations land with the pressures, and
// drop proof-grade lines that trail off into bare numbers ("support loss 75") —
// those belong in Technical, not in the lead.
const NEGATIVE_PHRASE_HINT = /\b(reduc\w*|lean\w*|thin\w*|worn|overused|risk\w*|pressure\w*|stress\w*|fail\w*|scarce\w*|deficit\w*|shortage|sick\w*|strain\w*|hardship|loss\w*|lost|drop\w*|declin\w*)\b/i;
const DEBUG_GRADE_LINE = /\b\d+(?:\.\d+)?%?\s*[.!?]?$/;

export function deriveSupportsAndPressures(band: Band): {
  readonly supports: readonly string[];
  readonly pressures: readonly string[];
} {
  const supportCandidates: (string | undefined)[] = [
    ...(band.seasonalSupport?.topSeasonalSupportReasons ?? []),
    band.visibleNature?.plantHeadline,
    band.visibleNature?.aquaticHeadline,
  ].filter((line) => line === undefined || !DEBUG_GRADE_LINE.test(line));
  const supports: (string | undefined)[] = supportCandidates.filter(
    (line) => line === undefined || !NEGATIVE_PHRASE_HINT.test(line),
  );
  const pressures: (string | undefined)[] = supportCandidates.filter(
    (line) => line !== undefined && NEGATIVE_PHRASE_HINT.test(line),
  );
  const hunger = band.seasonalSupport?.hungerClassification;

  if (hunger !== undefined && hunger !== "stable") {
    pressures.push(hungerClassificationLabel(hunger));
  }

  const adaptation = band.foragingAdaptation;

  if (adaptation !== undefined && adaptation.mode !== "stable") {
    const fallback = adaptation.fallbackCandidates[0];
    pressures.push(fallback?.reason ?? fallbackLevelLabel(fallback?.level));
  }

  const logistics = band.bodyCampLogistics;

  if (logistics !== undefined && logistics.mode !== "stable") {
    pressures.push(logistics.logisticCapacity.limitingReason);
  }

  const place = band.protoCampMemory?.currentPlace;

  if (place !== undefined) {
    pressures.push(place.negativeReasons[0]?.reason);
  }

  return {
    supports: uniqueLines(supports, 3),
    pressures: uniqueLines(pressures, 3),
  };
}

/*
 * WHOLE-UI-READABILITY-HISTORY-FUN-1 — the Overview's 30-second lead.
 * One status sentence, the main weight and the main help, and the latest
 * turn — composed from phrases the band already grounds, phrased so any
 * grounded fragment reads correctly.
 */
export interface OverviewLead {
  readonly status: string;
  readonly weight?: string;
  readonly help?: string;
  readonly change?: string;
}

export function deriveOverviewLead(band: Band): OverviewLead {
  const { supports, pressures } = deriveSupportsAndPressures(band);
  const recent = deriveRecentStoryEvents(band, 1)[0];
  const pressure = pressures[0];
  const support = supports[0];

  return {
    status: sentenceCase(band.conditionProfile?.summary ?? "No condition report yet."),
    weight: pressure === undefined ? undefined : `Weighing on them most: ${lowerFirstLead(pressure)}.`,
    help: support === undefined ? undefined : `Helping them most: ${lowerFirstLead(support)}.`,
    change: recent === undefined ? undefined : `Latest turn: ${lowerFirstLead(recent.description)}.`,
  };
}

/*
 * 1C — theme-level dedupe: two generated lines can repeat the same idea in
 * different words ("weak remnant near refuge" three times). Word-overlap is a
 * cheap deterministic proxy for "same theme".
 */
export function similarTheme(left: string, right: string): boolean {
  const tokensOf = (value: string) =>
    new Set(value.toLowerCase().split(/[^a-z]+/).filter((word) => word.length > 3));
  const leftTokens = tokensOf(left);
  const rightTokens = tokensOf(right);

  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return false;
  }

  let shared = 0;
  for (const word of leftTokens) {
    if (rightTokens.has(word)) {
      shared += 1;
    }
  }

  return shared / Math.min(leftTokens.size, rightTokens.size) >= 0.6;
}

function lowerFirstLead(line: string): string {
  const cleaned = stripRawSuffix(line).replace(/[.!?]+$/, "");

  if (cleaned.length === 0) {
    return cleaned;
  }

  return cleaned.charAt(0).toLowerCase() + cleaned.slice(1);
}

export function derivePlayerStory(
  band: Band,
  currentTick: TickNumber,
  stepMode: StepMode,
): PlayerStory {
  const life = deriveBandLifeSummary(band, currentTick, stepMode);
  const { supports, pressures } = deriveSupportsAndPressures(band);
  const topTalkItem = band.campRumors?.items[0];

  return {
    condition: sentenceCase(band.conditionProfile?.summary ?? "No condition report yet."),
    doingNow: sentenceCase(life.activityLine),
    movement: sentenceCase(life.movementLine),
    intent: sentenceCase(life.intentLine),
    why: sentenceCase(life.reasonLine),
    happened: deriveRecentStoryEvents(band),
    topTalk: topTalkItem === undefined ? undefined : sentenceCase(topTalkItem.summary),
    whyHere: deriveWhyHereCard(band),
    supports,
    pressures,
  };
}
