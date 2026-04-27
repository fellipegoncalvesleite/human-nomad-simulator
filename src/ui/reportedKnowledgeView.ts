/*
 * reportedKnowledgeView — pure UI helper that turns a band's reportedKnowledge
 * (WordOfMouthReport[] + ReportedKnowledgeSpeculation[]) into player-facing talk
 * cards, badges, approximate-region wording, grouped digests, activity-linked
 * notes, and history lifecycle entries.
 *
 * This is the single source of player-facing report wording for Overview /
 * Activity / History / Roster. The Technical tab keeps its own verbatim raw
 * formatters (full debug detail) and does NOT use this module.
 *
 * Purity contract (matches bandLife.ts / bandSummary.ts / labels.ts):
 *   - type-only sim imports (+ the pure, deterministic getWorldTimeForTick helper)
 *   - never mutates sim state, never participates in any sim decision
 *   - no React / Zustand / DOM / canvas imports
 * Player-facing wording is intentionally approximate and uncertain: no tile ids,
 * no exact unconfirmed targets, no "go here", no implied hidden truth.
 */
import type {
  Band,
  ReportConfirmationStatus,
  ReportDistortionLevel,
  ReportReceiverDisposition,
  ReportTrustBasis,
  ReportedKnowledgeDirectionFromReceiver,
  ReportedKnowledgeRegionKind,
  ReportedKnowledgeRegionTarget,
  ReportedKnowledgeSourceBasis,
  ReportedKnowledgeSpeculation,
  ReportedKnowledgeSpeculationHypothesis,
  ReportedKnowledgeTopic,
  WordOfMouthReport,
} from "../sim/agents/types";
import type { BandId, TickNumber } from "../sim/core/types";
import { getWorldTimeForTick } from "../sim/tick/time";

import type { IconName } from "./icons";
import type { StatusTone } from "./bandSummary";

// ---------------------------------------------------------------------------
// View models
// ---------------------------------------------------------------------------

export interface ReportBadge {
  readonly label: string;
  readonly tone: StatusTone;
  readonly title: string;
}

export type TalkCategoryKey =
  | "internal_talk"
  | "scout_report"
  | "forager_report"
  | "fishing_report"
  | "hunter_report"
  | "gathering_report"
  | "water_report"
  | "camp_memory"
  | "seasonal_talk"
  | "shared_use_note"
  | "kin_report"
  | "contact_report"
  | "distant_rumor"
  | "warning"
  | "speculation";

export type TalkScope = "internal" | "inter_band";

export type TalkLifecycleState =
  | "fresh"
  | "active"
  | "fading"
  | "stale";

export type TalkImportanceClass =
  | "warning"
  | "opportunity"
  | "social"
  | "checked"
  | "speculation"
  | "old_story";

export type TalkFilterKey =
  | "all"
  | "warnings"
  | "opportunities"
  | "speculations"
  | "checked"
  | "fading";

export interface TalkCard {
  readonly id: string;
  readonly icon: IconName;
  readonly tone: StatusTone;
  readonly scope: TalkScope;
  readonly categoryKey: TalkCategoryKey;
  readonly categoryLabel: string;
  readonly importanceClass: TalkImportanceClass;
  readonly lifecycleState: TalkLifecycleState;
  readonly checked: boolean;
  readonly sourceKind: string;
  readonly topicKey: string;
  /** Plain-language topic, e.g. "Good fishing". */
  readonly title: string;
  /** Who/what the source is, e.g. "Scouts", "Lineage kin". */
  readonly source: string;
  /**
   * For inter-band talk only: the band this report was heard FROM (the sender;
   * the selected band is always the receiver). Lets the UI name it and link to
   * it. Undefined for internal talk and speculation.
   */
  readonly sourceBandId?: BandId;
  /** Approximate region/direction wording, e.g. "downstream, around a river reach". */
  readonly region: string;
  readonly badges: readonly ReportBadge[];
  /** Disposition / lifecycle line; only set when notable. */
  readonly lifecycle?: string;
  /** Higher = more relevant; used for ordering only. */
  readonly relevance: number;
}

export interface TalkSectionDigest {
  readonly key: TalkScope;
  readonly title: string;
  readonly cards: readonly TalkCard[];
  readonly allCards: readonly TalkCard[];
  readonly activeCount: number;
  readonly moreCount: number;
  readonly groupNote?: string;
}

export interface TalkOverviewModel {
  readonly internal: TalkSectionDigest;
  readonly interBand: TalkSectionDigest;
  readonly activeCount: number;
}

export interface TalkDigest {
  readonly cards: readonly TalkCard[];
  /** Active talk not shown in `cards` (the "+N more" count). */
  readonly moreCount: number;
  /** One-line grouped note, e.g. "3 reports mention good fishing downstream." */
  readonly groupNote?: string;
}

export interface ActivityTalkNote {
  readonly id: string;
  readonly icon: IconName;
  readonly tone: StatusTone;
  readonly text: string;
}

export interface ReportHistoryNote {
  readonly key: string;
  readonly tick: number;
  readonly when: string;
  readonly icon: IconName;
  readonly tone: StatusTone;
  readonly title: string;
  readonly detail: string;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Compact Overview digest: top `limit` active talk cards + "more" + a group note. */
export function deriveTalkDigest(band: Band, limit = 3): TalkDigest {
  const cards = deriveAllTalkCards(band);
  const shown = selectTopTalkCards(cards, limit);
  return {
    cards: shown,
    moreCount: Math.max(0, cards.length - shown.length),
    groupNote: deriveGroupNote(band),
  };
}

export function deriveTalkOverviewModel(band: Band, limit = 3): TalkOverviewModel {
  const cards = deriveAllTalkCards(band);
  const internalCards = cards.filter((card) => card.scope === "internal");
  const interBandCards = cards.filter((card) => card.scope === "inter_band");

  return {
    internal: buildTalkSection("internal", "Internal Band Talk", internalCards, limit, deriveGroupNoteForScope(band, "internal")),
    interBand: buildTalkSection("inter_band", "Inter-Band Talk", interBandCards, limit, deriveGroupNoteForScope(band, "inter_band")),
    activeCount: cards.length,
  };
}

/** Full ordered set of active talk cards (reports + speculations), most relevant first. */
export function deriveAllTalkCards(band: Band): readonly TalkCard[] {
  const state = band.reportedKnowledge;
  if (state === undefined) {
    return [];
  }

  const reportCards = (state.reports ?? [])
    .filter((report) => report.receiverDisposition !== "ignored")
    .map((report) => reportToCard(report, band));
  const speculationCards = (state.speculations ?? [])
    .filter((entry) => entry.receiverDisposition !== "dismissed" && entry.receiverDisposition !== "disproven")
    .map(speculationToCard);

  return [...reportCards, ...speculationCards].sort(
    (left, right) => right.relevance - left.relevance || left.id.localeCompare(right.id),
  );
}

export function filterTalkCards(cards: readonly TalkCard[], filter: TalkFilterKey): readonly TalkCard[] {
  switch (filter) {
    case "all":
      return cards;
    case "warnings":
      return cards.filter((card) => card.importanceClass === "warning");
    case "opportunities":
      return cards.filter((card) => card.importanceClass === "opportunity");
    case "speculations":
      return cards.filter((card) => card.importanceClass === "speculation");
    case "checked":
      return cards.filter((card) => card.checked);
    case "fading":
      return cards.filter((card) => card.lifecycleState === "fading" || card.lifecycleState === "stale");
  }
}

function buildTalkSection(
  key: TalkScope,
  title: string,
  allCards: readonly TalkCard[],
  limit: number,
  groupNote: string | undefined,
): TalkSectionDigest {
  const cards = selectTopTalkCards(allCards, limit);
  return {
    key,
    title,
    cards,
    allCards,
    activeCount: allCards.length,
    moreCount: Math.max(0, allCards.length - cards.length),
    groupNote,
  };
}

function selectTopTalkCards(cards: readonly TalkCard[], limit: number): readonly TalkCard[] {
  if (cards.length <= limit) {
    return cards;
  }

  const selected: TalkCard[] = [];
  const preferred: readonly TalkImportanceClass[] = ["warning", "opportunity", "social"];

  for (const importanceClass of preferred) {
    if (selected.length >= limit) {
      break;
    }
    const candidate = cards.find(
      (card) => card.importanceClass === importanceClass && !selected.some((entry) => entry.id === card.id),
    );
    if (candidate !== undefined) {
      selected.push(candidate);
    }
  }

  for (const card of cards) {
    if (selected.length >= limit) {
      break;
    }
    if (!selected.some((entry) => entry.id === card.id)) {
      selected.push(card);
    }
  }

  return selected.sort((left, right) => right.relevance - left.relevance || left.id.localeCompare(right.id));
}

/**
 * Cheapest single-line summary for the roster (computed for every visible band).
 * One bounded pass, no card/badge construction. Returns undefined when there is
 * no active talk worth surfacing.
 */
export function deriveTopTalkLine(band: Band): string | undefined {
  const state = band.reportedKnowledge;
  if (state === undefined) {
    return undefined;
  }

  let best: WordOfMouthReport | undefined;
  let bestScore = -1;
  for (const report of state.reports ?? []) {
    if (report.receiverDisposition === "ignored") {
      continue;
    }
    const score = reportRelevance(report);
    if (score > bestScore) {
      bestScore = score;
      best = report;
    }
  }

  if (best === undefined) {
    // Fall back to the strongest live speculation if there are no reports.
    let bestSpec: ReportedKnowledgeSpeculation | undefined;
    let bestSpecScore = -1;
    for (const spec of state.speculations ?? []) {
      if (spec.receiverDisposition === "dismissed" || spec.receiverDisposition === "disproven") {
        continue;
      }
      if (spec.confidence > bestSpecScore) {
        bestSpecScore = spec.confidence;
        bestSpec = spec;
      }
    }
    if (bestSpec === undefined) {
      return undefined;
    }
    return `Talk: ${HYPOTHESIS_TITLE[bestSpec.hypothesis].toLowerCase()} ${regionPhrase(bestSpec.regionTarget)} (guess)`;
  }

  const lead = isWarningTopic(best.topic) ? "Warning" : "Talk";
  return `${lead}: ${TOPIC_TITLE[best.topic].toLowerCase()} ${regionPhrase(best.regionTarget)} (${confirmationWord(best.confirmationStatus)})`;
}

/**
 * Activity-linked talk: internal talk that came back from recent trips
 * (scouts, foragers, water/hunting/gathering parties, poor returns). Connects
 * "the band is talking about X" to the trips the player can see in Activity.
 */
export function deriveActivityTalkNotes(band: Band, limit = 3): readonly ActivityTalkNote[] {
  const reports = band.reportedKnowledge?.reports ?? [];
  const notes: ActivityTalkNote[] = [];

  for (const report of reports) {
    if (report.receiverDisposition === "ignored") {
      continue;
    }
    if (!TRIP_SOURCE_BASES.has(report.sourceBasis)) {
      continue;
    }
    notes.push({
      id: report.reportId,
      icon: TOPIC_ICON[report.topic],
      tone: categoryOf(report).tone,
      text: `${tripReturnLead(report.sourceBasis)} ${tripTalkPhrase(report.topic)} ${regionPhrase(report.regionTarget)}.`,
    });
  }

  notes.sort((left, right) => reportRelevanceById(reports, right.id) - reportRelevanceById(reports, left.id));
  return notes.slice(0, limit);
}

/** Notable report/speculation lifecycle moments, as compact history timeline notes. */
export function deriveReportHistoryNotes(
  band: Band,
  currentTick: TickNumber,
  limit = 3,
): readonly ReportHistoryNote[] {
  const reports = band.reportedKnowledge?.reports ?? [];
  const speculations = band.reportedKnowledge?.speculations ?? [];
  const notes: ReportHistoryNote[] = [];

  for (const report of reports) {
    const moment = reportLifecycleMoment(report);
    if (moment === undefined) {
      continue;
    }
    const tick = Number(report.tickReceived);
    notes.push({
      key: `rk-${report.reportId}`,
      tick,
      when: whenLabel(tick, currentTick),
      icon: moment.icon,
      tone: moment.tone,
      title: moment.title(TOPIC_TITLE[report.topic].toLowerCase(), regionPhrase(report.regionTarget)),
      detail: moment.detail,
    });
  }

  for (const spec of speculations) {
    const moment = speculationLifecycleMoment(spec);
    if (moment === undefined) {
      continue;
    }
    const tick = Number(spec.tick);
    notes.push({
      key: `rk-spec-${spec.speculationId}`,
      tick,
      when: whenLabel(tick, currentTick),
      icon: moment.icon,
      tone: moment.tone,
      title: moment.title(HYPOTHESIS_TITLE[spec.hypothesis].toLowerCase(), regionPhrase(spec.regionTarget)),
      detail: moment.detail,
    });
  }

  return notes.sort((left, right) => right.tick - left.tick).slice(0, limit);
}

// ---------------------------------------------------------------------------
// Card construction
// ---------------------------------------------------------------------------

function reportToCard(report: WordOfMouthReport, band: Band): TalkCard {
  const category = categoryOf(report);
  const scope = report.trustBasis === "internal_band" ? "internal" : "inter_band";
  const lifecycleState = reportLifecycleState(report);
  const importanceClass = reportImportanceClass(report, scope, lifecycleState);
  const checked = isCheckedOrConfirmedReport(report);
  return {
    id: report.reportId,
    icon: TOPIC_ICON[report.topic],
    tone: category.tone,
    scope,
    categoryKey: category.key,
    categoryLabel: category.label,
    importanceClass,
    lifecycleState,
    checked,
    sourceKind: report.sourceBasis,
    topicKey: report.topic,
    title: TOPIC_TITLE[report.topic],
    source: sourceLabel(report),
    sourceBandId:
      scope === "inter_band" && report.sourceBandId !== band.id ? report.sourceBandId : undefined,
    region: regionPhrase(report.regionTarget),
    badges: buildReportBadges(report),
    lifecycle: dispositionNote(report.receiverDisposition),
    relevance: reportRelevance(report, band),
  };
}

function speculationToCard(spec: ReportedKnowledgeSpeculation): TalkCard {
  const lifecycleState = speculationLifecycleState(spec);
  const checked =
    spec.receiverDisposition === "checked_by_probe" ||
    spec.receiverDisposition === "partially_confirmed" ||
    spec.receiverDisposition === "disproven";
  return {
    id: spec.speculationId,
    icon: HYPOTHESIS_ICON[spec.hypothesis],
    tone: "moving",
    scope: "internal",
    categoryKey: "speculation",
    categoryLabel: "Speculation",
    importanceClass: lifecycleState === "stale" ? "old_story" : "speculation",
    lifecycleState,
    checked,
    sourceKind: "internal_speculation",
    topicKey: spec.hypothesis,
    title: HYPOTHESIS_TITLE[spec.hypothesis],
    source: "Band's own guess",
    region: regionPhrase(spec.regionTarget),
    badges: buildSpeculationBadges(spec),
    lifecycle: speculationDispositionNote(spec.receiverDisposition),
    // Speculations sit below grounded reports of similar confidence.
    relevance: spec.confidence * 0.6,
  };
}

// ---------------------------------------------------------------------------
// Category (who/what the talk is)
// ---------------------------------------------------------------------------

interface TalkCategory {
  readonly key: TalkCategoryKey;
  readonly label: string;
  readonly tone: StatusTone;
}

function categoryOf(report: WordOfMouthReport): TalkCategory {
  if (isWarningTopic(report.topic)) {
    return { key: "warning", label: "Warning", tone: "struggling" };
  }
  if (report.trustBasis === "internal_band") {
    switch (report.sourceBasis) {
      case "scout_return":
        return { key: "scout_report", label: "Scouts", tone: "exploring" };
      case "forager_return":
      case "successful_foragers":
      case "frustrated_foragers":
        return { key: "forager_report", label: "Foragers", tone: "settled" };
      case "fishing_party_return":
        return { key: "fishing_report", label: "Fishing party", tone: "settled" };
      case "hunter_return":
        return { key: "hunter_report", label: "Hunters", tone: "exploring" };
      case "gathering_party_return":
        return { key: "gathering_report", label: "Gatherers", tone: "settled" };
      case "water_party_return":
        return { key: "water_report", label: "Water party", tone: "settled" };
      case "residential_move_memory":
      case "recent_movers":
      case "elder_memory":
        return { key: "camp_memory", label: "Camp memory", tone: "settled" };
      case "inferred_from_seasonal_pattern":
      case "seasonal_observers":
        return { key: "seasonal_talk", label: "Seasonal talk", tone: "moving" };
      case "range_friction_report":
      case "range_shared_use":
      case "crowded_water_contact":
        return { key: "shared_use_note", label: "Shared-use note", tone: "pressure" };
      case "direct_trip_return":
      case "camp_talk":
      case "dependent_camp_pressure":
      case "route_followers":
      case "crossing_party":
      case "visible_landscape_cue":
      case "kin_report":
      case "repeated_contact_report":
      case "internal_speculation":
      case "parent_band":
      case "daughter_band":
      case "sibling_band":
      case "lineage_kin":
      case "familiar_neighbor":
      case "weak_contact":
      case "unknown_band_nearby":
      case "ford_contact":
      case "delta_contact":
      case "secondhand_chain":
        return { key: "internal_talk", label: "Camp talk", tone: "exploring" };
    }
  }
  switch (report.trustBasis) {
    case "parent":
    case "daughter":
    case "sibling":
    case "lineage_kin":
      return { key: "kin_report", label: "Kin report", tone: "settled" };
    case "familiar_neighbor":
    case "repeated_contact":
    case "shared_water":
    case "residential_proximity":
    case "range_friction":
      return { key: "contact_report", label: "Contact report", tone: "exploring" };
    case "weak_contact":
    case "stranger":
      return { key: "distant_rumor", label: "Distant rumor", tone: "moving" };
  }
}

function sourceLabel(report: WordOfMouthReport): string {
  const basisLabel = INTERNAL_SOURCE_LABEL[report.sourceBasis];
  if (report.trustBasis === "internal_band") {
    return basisLabel;
  }
  return basisLabel === "Camp talk" ? TRUST_SOURCE_LABEL[report.trustBasis] : basisLabel;
}

const INTERNAL_SOURCE_LABEL: Record<ReportedKnowledgeSourceBasis, string> = {
  direct_trip_return: "People who came back",
  scout_return: "Scouts",
  forager_return: "Foragers",
  fishing_party_return: "Fishing party",
  water_party_return: "Water party",
  hunter_return: "Hunters",
  gathering_party_return: "Gatherers",
  camp_talk: "Camp talk",
  elder_memory: "Older camp memory",
  dependent_camp_pressure: "Camp dependents",
  recent_movers: "Recent movers",
  route_followers: "Route followers",
  crossing_party: "Crossing party",
  visible_landscape_cue: "Visible landscape",
  seasonal_observers: "Seasonal observers",
  frustrated_foragers: "Frustrated foragers",
  successful_foragers: "Successful foragers",
  residential_move_memory: "Camp memory",
  kin_report: "Camp talk",
  repeated_contact_report: "Camp talk",
  range_friction_report: "Recent talk",
  inferred_from_seasonal_pattern: "Seasonal talk",
  internal_speculation: "Band's own guess",
  parent_band: "Parent band",
  daughter_band: "Daughter band",
  sibling_band: "Sibling band",
  lineage_kin: "Lineage kin",
  familiar_neighbor: "Familiar neighbour",
  weak_contact: "Weak contact",
  unknown_band_nearby: "Unknown nearby band",
  range_shared_use: "Shared-use report",
  crowded_water_contact: "Crowded water contact",
  ford_contact: "Ford contact",
  delta_contact: "Delta contact",
  secondhand_chain: "Secondhand chain",
};

const TRUST_SOURCE_LABEL: Record<ReportTrustBasis, string> = {
  internal_band: "Camp talk",
  parent: "Parent band",
  daughter: "Daughter band",
  sibling: "Sibling band",
  lineage_kin: "Lineage kin",
  familiar_neighbor: "Familiar neighbour",
  repeated_contact: "Known contact",
  shared_water: "Shared-water band",
  residential_proximity: "Nearby camp",
  range_friction: "Shared-use neighbour",
  weak_contact: "Weak contact",
  stranger: "Distant band",
};

// ---------------------------------------------------------------------------
// Badges (read-at-a-glance uncertainty)
// ---------------------------------------------------------------------------

// Returned in priority order; Overview slices to the first couple, fuller views
// (history detail / expanded list) can show all of them.
function buildReportBadges(report: WordOfMouthReport): readonly ReportBadge[] {
  const badges: ReportBadge[] = [];

  switch (report.confirmationStatus) {
    case "partially_confirmed":
      badges.push({ label: "Partly confirmed", tone: "settled", title: "A probe found some supporting evidence" });
      break;
    case "confirmed":
      badges.push({ label: "Confirmed", tone: "settled", title: "The band's own knowledge supports this" });
      break;
    case "strengthened":
      badges.push({ label: "Strengthened", tone: "settled", title: "Later evidence made this report stronger" });
      break;
    case "corrected":
      badges.push({ label: "Corrected", tone: "exploring", title: "Local knowledge corrected or narrowed this story" });
      break;
    case "contradicted":
      badges.push({ label: "Contradicted", tone: "struggling", title: "Evidence later went against this" });
      break;
    case "disputed":
      badges.push({ label: "Disputed", tone: "pressure", title: "The band has both supporting and contradicting evidence" });
      break;
    case "downgraded":
      badges.push({ label: "Downgraded", tone: "gone", title: "The story lost force without fresh support" });
      break;
    case "stale":
      badges.push({ label: "Stale", tone: "gone", title: "Old and unrefreshed for some time" });
      break;
    case "unconfirmed":
      if (report.receiverDisposition === "checked_by_probe") {
        badges.push({ label: "Checked", tone: "exploring", title: "The band checked this with a probe" });
      } else {
        badges.push({ label: "Unchecked", tone: "moving", title: "Not yet checked on the ground" });
      }
      break;
  }

  const distortion = distortionBadge(report.distortionLevel);
  if (distortion !== undefined) {
    badges.push(distortion);
  }

  badges.push(confidenceBadge(report.confidence));

  if (report.confirmationStatus !== "stale") {
    if (report.freshness >= 0.66) {
      badges.push({ label: "Fresh", tone: "settled", title: "Heard recently" });
    } else if (report.freshness <= 0.3) {
      badges.push({ label: "Old", tone: "gone", title: "Heard a while ago" });
    }
  }

  if (report.trustBasis !== "internal_band") {
    if (report.hops > 0) {
      badges.push({ label: "Secondhand", tone: "moving", title: "Passed along, not seen by this band" });
    }
    if (report.contactMechanism !== undefined) {
      badges.push({ label: contactMechanismLabel(report.contactMechanism), tone: "exploring", title: "How this report reached the band" });
    }
    if (isKinTrust(report.trustBasis) && report.confidence >= 0.5) {
      badges.push({ label: "Trusted kin", tone: "settled", title: "From trusted lineage kin" });
    } else if (report.trustBasis === "weak_contact" || report.trustBasis === "stranger") {
      badges.push({ label: "Weak source", tone: "gone", title: "From a weak or distant source" });
    }
  }

  return badges;
}

function contactMechanismLabel(mechanism: NonNullable<WordOfMouthReport["contactMechanism"]>): string {
  switch (mechanism) {
    case "nearby_camp":
      return "Nearby camp";
    case "direct_contact_memory":
      return "Known contact";
    case "parent_daughter_visit":
      return "Kin visit";
    case "sibling_lineage_visit":
      return "Lineage visit";
    case "lineage_route":
      return "Lineage route";
    case "shared_water_place":
      return "Shared water";
    case "shared_ford_or_crossing":
      return "Shared ford";
    case "shared_delta_or_wetland":
      return "Shared wetland";
    case "range_shared_use":
      return "Shared range";
    case "known_route_or_corridor":
      return "Known route";
    case "secondhand_relay":
      return "Relay";
  }
}

function buildSpeculationBadges(spec: ReportedKnowledgeSpeculation): readonly ReportBadge[] {
  const badges: ReportBadge[] = [{ label: "Speculation", tone: "moving", title: "A guess, not a report — needs checking" }];
  badges.push(confidenceBadge(spec.confidence));
  if (spec.receiverDisposition === "partially_confirmed") {
    badges.push({ label: "Partly confirmed", tone: "settled", title: "A probe found some supporting evidence" });
  } else if (spec.receiverDisposition === "checked_by_probe") {
    badges.push({ label: "Checked", tone: "exploring", title: "The band checked this with a probe" });
  }
  if (spec.contradictionCount > 0) {
    badges.push({ label: "Doubted", tone: "struggling", title: "Some evidence went against it" });
  }
  return badges;
}

function distortionBadge(level: ReportDistortionLevel): ReportBadge | undefined {
  switch (level) {
    case "exaggerated":
      return { label: "Possibly exaggerated", tone: "pressure", title: "Grounded signal, but the source may be overstating it" };
    case "vague":
      return { label: "Vague", tone: "moving", title: "The report is imprecise" };
    case "direction_blurred":
      return { label: "Vague direction", tone: "moving", title: "The direction is blurred through transmission" };
    case "overgeneralized":
      return { label: "Overgeneralized", tone: "moving", title: "A local report may have been stretched too broadly" };
    case "region_shifted":
      return { label: "Region shifted", tone: "moving", title: "The receiver may map this to the wrong nearby feature" };
    case "wrong_or_misleading":
      return { label: "Unreliable", tone: "struggling", title: "May be wrong or misleading after weak contact or too many hops" };
    case "understated":
      return { label: "Understated", tone: "pressure", title: "The warning may be softer than the underlying signal" };
    case "source_biased":
      return { label: "Source-biased", tone: "pressure", title: "The source is under crowding or range pressure" };
    case "stale":
      return { label: "Old story", tone: "gone", title: "The story may be misleading after time or season changed" };
    case "none":
      return undefined;
  }
}

function confidenceBadge(confidence: number): ReportBadge {
  if (confidence >= 0.66) {
    return { label: "High confidence", tone: "settled", title: "Strong for this report source" };
  }
  if (confidence >= 0.42) {
    return { label: "Medium confidence", tone: "moving", title: "Plausible but still uncertain" };
  }
  return { label: "Low confidence", tone: "gone", title: "Weak signal; unlikely to matter much" };
}

// ---------------------------------------------------------------------------
// Lifecycle / disposition wording (non-causal — talk only ever nudged checking)
// ---------------------------------------------------------------------------

function dispositionNote(disposition: ReportReceiverDisposition): string | undefined {
  switch (disposition) {
    case "ignored":
      return undefined;
    case "remembered_only":
      return "Remembered for now";
    case "cautiously_considered":
      return "Being weighed cautiously";
    case "checked_by_probe":
      return "The band checked this with a probe";
    case "used_as_minor_bias":
      return "It lightly shaped where the band looked";
    case "acted_on":
      return "It helped draw some checking that way";
    case "partially_confirmed":
      return "A probe found some supporting evidence";
    case "contradicted":
      return "A probe found weak evidence, so trust fell";
    case "stale":
      return "The story faded over time";
  }
}

function speculationDispositionNote(disposition: ReportedKnowledgeSpeculation["receiverDisposition"]): string | undefined {
  switch (disposition) {
    case "dismissed":
    case "disproven":
      return undefined;
    case "remembered":
      return "Kept in mind as a guess";
    case "watched":
      return "Quietly watched";
    case "checked_by_probe":
      return "The band checked the idea";
    case "used_as_minor_bias":
      return "It lightly shaped where the band looked";
    case "partially_confirmed":
      return "A probe found some supporting evidence";
  }
}

function reportLifecycleState(report: WordOfMouthReport): TalkLifecycleState {
  if (report.confirmationStatus === "stale" || report.confirmationStatus === "downgraded" || report.receiverDisposition === "stale") {
    return "stale";
  }
  if (report.freshness >= 0.66) {
    return "fresh";
  }
  if (report.freshness <= 0.28 || report.confirmationStatus === "contradicted" || report.confirmationStatus === "disputed") {
    return "fading";
  }
  return "active";
}

function speculationLifecycleState(spec: ReportedKnowledgeSpeculation): TalkLifecycleState {
  if (spec.receiverDisposition === "disproven") {
    return "stale";
  }
  if (spec.confidence <= 0.24 || spec.contradictionCount > spec.evidenceCount) {
    return "fading";
  }
  if (spec.confidence >= 0.58) {
    return "fresh";
  }
  return "active";
}

function reportImportanceClass(
  report: WordOfMouthReport,
  scope: TalkScope,
  lifecycleState: TalkLifecycleState,
): TalkImportanceClass {
  if (lifecycleState === "stale" || report.confirmationStatus === "stale" || report.confirmationStatus === "downgraded") {
    return "old_story";
  }
  if (isWarningTopic(report.topic)) {
    return "warning";
  }
  if (scope === "inter_band" || report.topic === "outsider_use_warning" || report.topic === "crowded_water_warning") {
    return "social";
  }
  if (isOpportunityTopic(report.topic)) {
    return "opportunity";
  }
  if (isCheckedOrConfirmedReport(report)) {
    return "checked";
  }
  return report.distortionLevel === "wrong_or_misleading" ? "old_story" : "speculation";
}

function isCheckedOrConfirmedReport(report: WordOfMouthReport): boolean {
  return (
    report.receiverDisposition === "checked_by_probe" ||
    report.receiverDisposition === "acted_on" ||
    report.receiverDisposition === "used_as_minor_bias" ||
    report.confirmationStatus === "partially_confirmed" ||
    report.confirmationStatus === "confirmed" ||
    report.confirmationStatus === "strengthened" ||
    report.confirmationStatus === "corrected" ||
    report.confirmationStatus === "contradicted" ||
    report.confirmationStatus === "disputed"
  );
}

interface LifecycleMoment {
  readonly icon: IconName;
  readonly tone: StatusTone;
  readonly title: (topic: string, region: string) => string;
  readonly detail: string;
}

function reportLifecycleMoment(report: WordOfMouthReport): LifecycleMoment | undefined {
  switch (report.confirmationStatus) {
    case "partially_confirmed":
    case "confirmed":
    case "strengthened":
    case "corrected":
      return {
        icon: "scout",
        tone: "settled",
        title: (topic, region) => `Checked: ${topic} ${region}`,
        detail: "A probe found some supporting evidence.",
      };
    case "contradicted":
    case "disputed":
      return {
        icon: "warning",
        tone: "struggling",
        title: (topic, region) => `Doubted: ${topic} ${region}`,
        detail: "A probe found weak evidence, so trust in the story fell.",
      };
    case "stale":
    case "downgraded":
      return {
        icon: "uncertain",
        tone: "gone",
        title: (topic, region) => `Faded: ${topic} ${region}`,
        detail: "The story faded after several seasons without confirmation.",
      };
    case "unconfirmed":
      if (report.receiverDisposition === "checked_by_probe") {
        return {
          icon: "scout",
          tone: "exploring",
          title: (topic, region) => `Checked: ${topic} ${region}`,
          detail: "The band sent a probe to look into the story.",
        };
      }
      if (report.receiverDisposition === "used_as_minor_bias" || report.receiverDisposition === "acted_on") {
        return {
          icon: "route",
          tone: "exploring",
          title: (topic, region) => `Talk drew interest: ${topic} ${region}`,
          detail: "It lightly shaped where the band looked — no move was forced.",
        };
      }
      return undefined;
  }
}

function speculationLifecycleMoment(spec: ReportedKnowledgeSpeculation): LifecycleMoment | undefined {
  switch (spec.receiverDisposition) {
    case "partially_confirmed":
      return {
        icon: "scout",
        tone: "settled",
        title: (topic, region) => `Checked a guess: ${topic} ${region}`,
        detail: "A probe found some supporting evidence for the idea.",
      };
    case "checked_by_probe":
      return {
        icon: "scout",
        tone: "exploring",
        title: (topic, region) => `Checked a guess: ${topic} ${region}`,
        detail: "The band looked into its own speculation.",
      };
    case "dismissed":
    case "disproven":
    case "remembered":
    case "watched":
    case "used_as_minor_bias":
      return undefined;
  }
}

// ---------------------------------------------------------------------------
// Grouping ("3 reports mention good fishing downstream")
// ---------------------------------------------------------------------------

function deriveGroupNote(band: Band): string | undefined {
  const reports = (band.reportedKnowledge?.reports ?? []).filter(
    (report) => report.receiverDisposition !== "ignored",
  );
  return deriveGroupNoteFromReports(reports);
}

function deriveGroupNoteForScope(band: Band, scope: TalkScope): string | undefined {
  const reports = (band.reportedKnowledge?.reports ?? []).filter((report) => {
    if (report.receiverDisposition === "ignored") {
      return false;
    }
    const reportScope: TalkScope = report.trustBasis === "internal_band" ? "internal" : "inter_band";
    return reportScope === scope;
  });

  return deriveGroupNoteFromReports(reports);
}

function deriveGroupNoteFromReports(reports: readonly WordOfMouthReport[]): string | undefined {
  if (reports.length < 2) {
    return undefined;
  }

  const buckets = new Map<string, { count: number; family: string; direction: ReportedKnowledgeDirectionFromReceiver }>();
  for (const report of reports) {
    const family = TOPIC_FAMILY[report.topic];
    const direction = report.regionTarget.directionFromReceiver;
    const key = `${family}|${direction}`;
    const existing = buckets.get(key);
    if (existing === undefined) {
      buckets.set(key, { count: 1, family, direction });
    } else {
      existing.count += 1;
    }
  }

  let best: { count: number; family: string; direction: ReportedKnowledgeDirectionFromReceiver } | undefined;
  for (const bucket of buckets.values()) {
    if (best === undefined || bucket.count > best.count) {
      best = bucket;
    }
  }

  if (best === undefined || best.count < 2) {
    return undefined;
  }

  const direction = best.direction === "uncertain" ? "" : ` ${DIRECTION_WORD[best.direction]}`;
  return `${best.count} reports mention ${best.family}${direction}.`;
}

// ---------------------------------------------------------------------------
// Region wording (approximate, no tile ids)
// ---------------------------------------------------------------------------

export function regionPhrase(region: ReportedKnowledgeRegionTarget): string {
  const direction = region.directionFromReceiver;
  const directionWord = DIRECTION_WORD[direction];
  const hasDirection = direction !== "uncertain";
  const kind = KIND_NOUN[region.regionKind];

  switch (region.precision) {
    case "story_only":
      return hasDirection ? `— a vague story, somewhere ${directionWord}` : `— a vague story about ${kind}`;
    case "vague_direction":
      return hasDirection ? `somewhere ${directionWord}` : `roughly toward ${kind}`;
    case "approximate_region":
      return hasDirection ? `${directionWord}, around ${kind}` : `around ${kind}`;
    case "exact_observed_area":
      return hasDirection ? `at ${kind}, ${directionWord}` : `at ${kind}`;
  }
}

const DIRECTION_WORD: Record<ReportedKnowledgeDirectionFromReceiver, string> = {
  upstream: "upstream",
  downstream: "downstream",
  across_river: "across the water",
  toward_hills: "toward the hills",
  toward_mountains: "toward the mountains",
  toward_lake: "toward the lake",
  toward_delta: "toward the delta",
  along_tributary: "along a tributary",
  beyond_known_edge: "beyond known country",
  near_parent_range: "near old family range",
  uncertain: "nearby",
};

const KIND_NOUN: Record<ReportedKnowledgeRegionKind, string> = {
  river_reach: "a river reach",
  tributary_corridor: "a tributary corridor",
  creek_valley: "a creek valley",
  delta_or_wetland: "wetland country",
  lake_shore: "the lake shore",
  opposite_bank: "the far bank",
  upland_slope: "the upland slopes",
  mountain_pass: "a hard-terrain pass",
  dry_margin: "dry-margin country",
  forest_edge: "a forest edge",
  familiar_range_edge: "the edge of known country",
  ford_area: "a crossing place",
  crowded_water_place: "a shared water place",
  unknown_directional_area: "uncertain country",
};

// ---------------------------------------------------------------------------
// Topic / hypothesis wording
// ---------------------------------------------------------------------------

const TOPIC_TITLE: Record<ReportedKnowledgeTopic, string> = {
  good_fishing: "Good fishing",
  good_fishing_region: "Good fishing country",
  reliable_water: "Reliable water",
  good_water_region: "Reliable water country",
  bad_water_warning: "Bad water",
  animal_abundance: "Plenty of animals",
  animals_seen: "Animal signs",
  animal_danger: "Dangerous animals",
  animal_danger_or_avoidance: "Animals to avoid",
  hunting_potential: "Worthwhile hunting",
  gathering_potential: "Good gathering",
  seasonal_opportunity: "A seasonal opportunity",
  seasonal_resource_pulse: "A seasonal pulse",
  ford_or_crossing: "A possible crossing",
  ford_or_crossing_known: "A known crossing",
  tributary_route: "A tributary route",
  tributary_route_hint: "A tributary route",
  creek_valley_hint: "A creek valley",
  possible_pass_through_hills: "A way through hard ground",
  poor_return_warning: "Poor returns",
  poor_return_region: "Poor-return country",
  crowded_range_warning: "A crowded range",
  crowded_water_warning: "A crowded water place",
  outsider_use_warning: "Outsiders using the area",
  good_delta_or_wetland: "Rich wetland country",
  safe_side_country: "Safer country across the way",
  better_land_speculation: "Better land",
  dry_place_warning: "Risky dry ground",
  snow_or_winter_hardship_warning: "Hard winter ground",
  good_camp_region: "A good camp region",
  return_to_known_place: "An old known place",
  uncertain_edge_opportunity: "An untested edge",
  avoid_place: "A place to avoid",
  unknown_general: "An uncertain story",
  unknown_story_or_guess: "An uncertain story",
};

// Short verb-phrase used in trip-return talk ("Scouts came back talking about X").
function tripTalkPhrase(topic: ReportedKnowledgeTopic): string {
  return `talking about ${TOPIC_TITLE[topic].toLowerCase()}`;
}

const TOPIC_ICON: Record<ReportedKnowledgeTopic, IconName> = {
  good_fishing: "fishing",
  good_fishing_region: "fishing",
  reliable_water: "water",
  good_water_region: "water",
  bad_water_warning: "warning",
  animal_abundance: "animal",
  animals_seen: "animal",
  animal_danger: "warning",
  animal_danger_or_avoidance: "warning",
  hunting_potential: "hunting",
  gathering_potential: "gathering",
  seasonal_opportunity: "season",
  seasonal_resource_pulse: "season",
  ford_or_crossing: "route",
  ford_or_crossing_known: "route",
  tributary_route: "route",
  tributary_route_hint: "route",
  creek_valley_hint: "route",
  possible_pass_through_hills: "route",
  poor_return_warning: "warning",
  poor_return_region: "warning",
  crowded_range_warning: "warning",
  crowded_water_warning: "warning",
  outsider_use_warning: "warning",
  good_delta_or_wetland: "fishing",
  safe_side_country: "region",
  better_land_speculation: "region",
  dry_place_warning: "warning",
  snow_or_winter_hardship_warning: "warning",
  good_camp_region: "camp",
  return_to_known_place: "return",
  uncertain_edge_opportunity: "region",
  avoid_place: "warning",
  unknown_general: "talk",
  unknown_story_or_guess: "talk",
};

// Coarse family used for grouping and group-note wording (lowercase noun phrase).
const TOPIC_FAMILY: Record<ReportedKnowledgeTopic, string> = {
  good_fishing: "good fishing",
  good_fishing_region: "good fishing",
  reliable_water: "reliable water",
  good_water_region: "reliable water",
  bad_water_warning: "bad water",
  animal_abundance: "animals",
  animals_seen: "animals",
  animal_danger: "animal danger",
  animal_danger_or_avoidance: "animal danger",
  hunting_potential: "hunting",
  gathering_potential: "gathering",
  seasonal_opportunity: "a seasonal opportunity",
  seasonal_resource_pulse: "a seasonal opportunity",
  ford_or_crossing: "a crossing",
  ford_or_crossing_known: "a crossing",
  tributary_route: "a route",
  tributary_route_hint: "a route",
  creek_valley_hint: "a creek valley",
  possible_pass_through_hills: "a passage",
  poor_return_warning: "poor returns",
  poor_return_region: "poor returns",
  crowded_range_warning: "crowding",
  crowded_water_warning: "crowding",
  outsider_use_warning: "outsiders",
  good_delta_or_wetland: "rich wetland",
  safe_side_country: "safer country",
  better_land_speculation: "better land",
  dry_place_warning: "dry ground",
  snow_or_winter_hardship_warning: "hard winter ground",
  good_camp_region: "a good camp region",
  return_to_known_place: "an old place",
  uncertain_edge_opportunity: "an untested edge",
  avoid_place: "a place to avoid",
  unknown_general: "an uncertain story",
  unknown_story_or_guess: "an uncertain story",
};

const HYPOTHESIS_TITLE: Record<ReportedKnowledgeSpeculationHypothesis, string> = {
  better_land_possible: "Better land may lie beyond",
  water_likely: "Water seems likely",
  animals_likely: "Animals seem likely",
  fish_likely: "Fish seem likely",
  route_likely_continues: "A route may continue",
  risk_likely: "Risk seems likely",
  crowding_likely: "Crowding seems likely",
  poor_return_likely: "Poor returns seem likely",
};

const HYPOTHESIS_ICON: Record<ReportedKnowledgeSpeculationHypothesis, IconName> = {
  better_land_possible: "region",
  water_likely: "water",
  animals_likely: "animal",
  fish_likely: "fishing",
  route_likely_continues: "route",
  risk_likely: "warning",
  crowding_likely: "warning",
  poor_return_likely: "warning",
};

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const WARNING_TOPICS = new Set<ReportedKnowledgeTopic>([
  "bad_water_warning",
  "animal_danger",
  "animal_danger_or_avoidance",
  "poor_return_warning",
  "poor_return_region",
  "crowded_range_warning",
  "crowded_water_warning",
  "outsider_use_warning",
  "dry_place_warning",
  "snow_or_winter_hardship_warning",
  "avoid_place",
]);

const OPPORTUNITY_TOPICS = new Set<ReportedKnowledgeTopic>([
  "good_fishing",
  "good_fishing_region",
  "reliable_water",
  "good_water_region",
  "animal_abundance",
  "animals_seen",
  "hunting_potential",
  "gathering_potential",
  "seasonal_opportunity",
  "seasonal_resource_pulse",
  "ford_or_crossing",
  "ford_or_crossing_known",
  "tributary_route",
  "tributary_route_hint",
  "creek_valley_hint",
  "possible_pass_through_hills",
  "good_delta_or_wetland",
  "safe_side_country",
  "better_land_speculation",
  "good_camp_region",
  "return_to_known_place",
  "uncertain_edge_opportunity",
]);

function isWarningTopic(topic: ReportedKnowledgeTopic): boolean {
  return WARNING_TOPICS.has(topic);
}

const TRIP_SOURCE_BASES = new Set<ReportedKnowledgeSourceBasis>([
  "direct_trip_return",
  "scout_return",
  "forager_return",
  "fishing_party_return",
  "water_party_return",
  "hunter_return",
  "gathering_party_return",
  "route_followers",
  "crossing_party",
  "frustrated_foragers",
  "successful_foragers",
]);

function tripReturnLead(sourceBasis: ReportedKnowledgeSourceBasis): string {
  switch (sourceBasis) {
    case "scout_return":
      return "Scouts came back";
    case "forager_return":
      return "Foragers came back";
    case "fishing_party_return":
      return "Fishing parties came back";
    case "water_party_return":
      return "Water parties keep coming back";
    case "hunter_return":
      return "Hunters came back";
    case "gathering_party_return":
      return "Gatherers came back";
    case "route_followers":
      return "Route followers came back";
    case "crossing_party":
      return "Crossing parties came back";
    case "visible_landscape_cue":
      return "People can see";
    case "frustrated_foragers":
      return "Frustrated foragers came back";
    case "successful_foragers":
      return "Successful foragers came back";
    case "direct_trip_return":
      return "People came back";
    case "camp_talk":
    case "elder_memory":
    case "dependent_camp_pressure":
    case "recent_movers":
    case "residential_move_memory":
    case "kin_report":
    case "repeated_contact_report":
    case "range_friction_report":
    case "inferred_from_seasonal_pattern":
    case "internal_speculation":
    case "seasonal_observers":
    case "parent_band":
    case "daughter_band":
    case "sibling_band":
    case "lineage_kin":
    case "familiar_neighbor":
    case "weak_contact":
    case "unknown_band_nearby":
    case "range_shared_use":
    case "crowded_water_contact":
    case "ford_contact":
    case "delta_contact":
    case "secondhand_chain":
      return "People keep talking";
  }
}

function isKinTrust(trust: ReportTrustBasis): boolean {
  return trust === "parent" || trust === "daughter" || trust === "sibling" || trust === "lineage_kin";
}

function confirmationWord(status: ReportConfirmationStatus): string {
  switch (status) {
    case "unconfirmed":
      return "unconfirmed";
    case "partially_confirmed":
      return "partly confirmed";
    case "confirmed":
      return "confirmed";
    case "strengthened":
      return "strengthened";
    case "corrected":
      return "corrected";
    case "contradicted":
      return "doubted";
    case "disputed":
      return "disputed";
    case "downgraded":
      return "downgraded";
    case "stale":
      return "old story";
  }
}

// Importance: warnings and checked/grounded talk rank above opportunity,
// social contact, and old vague stories. The band context nudges relevance
// only for display ordering; sim behaviour still uses reportedKnowledge.ts.
function reportRelevance(report: WordOfMouthReport, band?: Band): number {
  const base = report.confidence * 0.28 + report.freshness * 0.2 + trustDisplayWeight(report.trustBasis) * 0.16;
  let modifier = 0;
  switch (report.confirmationStatus) {
    case "partially_confirmed":
    case "confirmed":
    case "strengthened":
    case "corrected":
      modifier += 0.28;
      break;
    case "contradicted":
    case "disputed":
      modifier -= 0.36;
      break;
    case "stale":
    case "downgraded":
      modifier -= 0.28;
      break;
    case "unconfirmed":
      break;
  }

  if (isWarningTopic(report.topic)) {
    modifier += 0.34;
  } else if (isOpportunityTopic(report.topic)) {
    modifier += 0.22;
  }

  if (report.receiverDisposition === "checked_by_probe") {
    modifier += 0.18;
  } else if (report.receiverDisposition === "used_as_minor_bias" || report.receiverDisposition === "acted_on") {
    modifier += 0.12;
  }

  modifier += Math.min(0.16, report.evidenceCount * 0.05);
  modifier -= Math.min(0.16, report.contradictionCount * 0.06);

  if (report.trustBasis !== "internal_band") {
    modifier += 0.08;
  }

  if (band !== undefined) {
    modifier += bandNeedDisplayWeight(band, report.topic);
  }

  return base + modifier;
}

function reportRelevanceById(reports: readonly WordOfMouthReport[], id: string): number {
const report = reports.find((entry) => entry.reportId === id);
  return report === undefined ? 0 : reportRelevance(report);
}

function isOpportunityTopic(topic: ReportedKnowledgeTopic): boolean {
  return !isWarningTopic(topic) && OPPORTUNITY_TOPICS.has(topic);
}

function trustDisplayWeight(trust: ReportTrustBasis): number {
  switch (trust) {
    case "internal_band":
      return 0.96;
    case "parent":
      return 0.9;
    case "daughter":
      return 0.86;
    case "sibling":
      return 0.78;
    case "lineage_kin":
      return 0.7;
    case "repeated_contact":
    case "familiar_neighbor":
      return 0.58;
    case "shared_water":
    case "residential_proximity":
      return 0.48;
    case "range_friction":
      return 0.4;
    case "weak_contact":
      return 0.3;
    case "stranger":
      return 0.18;
  }
}

function bandNeedDisplayWeight(band: Band, topic: ReportedKnowledgeTopic): number {
  const waterStress = band.pressureState?.waterStress ?? 0;
  const crowdingPressure = band.rangeSaturation?.saturationPressure ?? band.pressureState?.nearbyBandPressure ?? 0;
  const mobilityPressure = band.pressureState?.mobilityPressure ?? 0;
  const decliningReturns = band.returnTrend?.chronicDecline === true || band.returnTrend?.trendDirection === "declining";

  if ((topic === "bad_water_warning" || topic === "good_water_region" || topic === "reliable_water") && waterStress > 0.32) {
    return 0.16;
  }
  if (
    (topic === "crowded_range_warning" || topic === "crowded_water_warning" || topic === "outsider_use_warning") &&
    crowdingPressure > 0.42
  ) {
    return 0.15;
  }
  if ((topic === "poor_return_warning" || topic === "poor_return_region") && decliningReturns) {
    return 0.14;
  }
  if ((topic === "better_land_speculation" || topic === "uncertain_edge_opportunity") && mobilityPressure > 0.38) {
    return 0.1;
  }
  return 0;
}

const SEASON_CAP: Record<string, string> = {
  spring: "Spring",
  summer: "Summer",
  autumn: "Autumn",
  winter: "Winter",
};

function whenLabel(tick: number, currentTick: TickNumber): string {
  const safeTick = Math.max(0, Math.min(Number(currentTick), tick));
  const time = getWorldTimeForTick(safeTick as TickNumber);
  return `${SEASON_CAP[time.season] ?? time.season} · Y${time.year}`;
}
