import type { BandId, ReasonId, RouteId, TileId, TickNumber } from "../core/types";
import type { NormalizedIntensity } from "../rules/types";
import type { WorldState } from "../world/types";
import { deriveAdaptiveHumanProfile } from "./adaptationBoundary";
import { deriveCampFootholdProfile } from "./campFoothold";
import { deriveCampMovementProfile } from "./campMovement";
import { deriveCanonicalEvents } from "./eventSystem";
import {
  deriveKnowledgeEcologyProfile,
  type KnowledgeEcologyDomain,
  type KnowledgeEcologyItem,
} from "./knowledgeEcology";
import { deriveMaterialAffordanceProfile } from "./materialAffordance";
import { effectiveResourceConfidence, type ResourcePatchMemory } from "./resourceKnowledge";
import {
  deriveSocialEcologicalDiffusionProfile,
  type SocialDiffusionDomain,
  type SocialDiffusionItem,
} from "./socialEcologicalDiffusion";
import type {
  AdaptiveIdea,
  AdaptivePracticeVariant,
  Band,
  ContextBoundAdaptation,
  LocalRoutine,
  SolutionAttempt,
} from "./types";

const PROFILE_ITEM_CAP = 18;
const ITEMS_PER_DOMAIN_CAP = 3;
const CARRIERS_PER_ITEM_CAP = 4;
const EVIDENCE_PER_ITEM_CAP = 4;
const LINKED_SYSTEM_PER_ITEM_CAP = 5;
const PUBLIC_CARD_CAP = 6;
const TECHNICAL_REF_CAP = 18;

export type KnowledgeCarrierDomain =
  | "route_corridor"
  | "crossing_ford"
  | "place_camp_country"
  | "food_work"
  | "water_refuge"
  | "risk_caution"
  | "material_practice"
  | "camp_care"
  | "social_contact_diffusion"
  | "range_rotation_pressure_relief"
  | "deep_history_inherited"
  | "local_routine_adaptive_practice";

export type KnowledgeAvailabilityState =
  | "active_practiced"
  | "fresh_observed"
  | "recently_tested"
  | "fading"
  | "dormant"
  | "distorted"
  | "inherited_fragment"
  | "copied_untested"
  | "locally_untested"
  | "blocked_by_context"
  | "lost_or_unavailable";

export type KnowledgeCarrierClass =
  | "recent_practice"
  | "repeated_route_use"
  | "repeated_crossing_use"
  | "camp_place_memory"
  | "seasonal_round"
  | "local_routine"
  | "event_memory"
  | "failed_attempt_memory"
  | "successful_attempt_memory"
  | "adaptive_response_memory"
  | "parent_inheritance"
  | "daughter_founding_fragment"
  | "social_trace"
  | "visible_trace"
  | "activity_party_memory"
  | "aggregate_elder_adult_memory"
  | "technical_only_projection";

export type KnowledgeCarrierSourceBasis = "lived" | "inherited" | "copied" | "mixed" | "technical";
export type KnowledgeCarrierLocationPrecision = "exact_tile" | "approximate_tile" | "region_fuzzy" | "none";

export type KnowledgeCarrierSourceSystem =
  | "knowledge_ecology"
  | "resource_patch_memory"
  | "material_affordance"
  | "camp_foothold"
  | "camp_movement"
  | "social_diffusion"
  | "adaptive_human"
  | "canonical_event"
  | "deep_history"
  | "reported_knowledge";

export interface KnowledgeCarrierEvidenceRef {
  readonly sourceSystem: KnowledgeCarrierSourceSystem;
  readonly sourceId: string;
  readonly label: string;
  readonly confidence: NormalizedIntensity;
  readonly stateHint?: string;
  readonly tileId?: TileId;
  readonly routeId?: RouteId;
  readonly lastUsedTick?: TickNumber;
  readonly lastTestedTick?: TickNumber;
  readonly lastUsedYear?: number;
  readonly reasonIds: readonly ReasonId[];
}

export interface KnowledgeCarrierBehaviorHook {
  readonly hook:
    | "future_scout_confidence_filter"
    | "future_candidate_confidence_filter"
    | "future_range_rotation_confidence_filter"
    | "future_adaptive_practice_confidence_filter"
    | "future_daughter_inheritance_filter"
    | "future_social_diffusion_filter";
  readonly status: "projection_only";
  readonly maxInfluence: 0;
  readonly capProof: "no_decision_path_reads_knowledge_carriers";
}

export interface KnowledgeCarrierItem {
  readonly id: string;
  readonly domain: KnowledgeCarrierDomain;
  readonly label: string;
  readonly publicTitle: string;
  readonly humanMeaning: string;
  readonly state: KnowledgeAvailabilityState;
  readonly carrierClasses: readonly KnowledgeCarrierClass[];
  readonly strength: NormalizedIntensity;
  readonly availability: NormalizedIntensity;
  readonly decayPressure: NormalizedIntensity;
  readonly dormancyReason?: string;
  readonly distortionRisk?: string;
  readonly localOnly: boolean;
  readonly sourceBasis: KnowledgeCarrierSourceBasis;
  readonly lived: boolean;
  readonly inherited: boolean;
  readonly copied: boolean;
  readonly parentSourceBandId?: BandId;
  readonly daughterLocalTestingNeeded: boolean;
  readonly inheritanceConfidenceLoss: NormalizedIntensity;
  readonly locationPrecision: KnowledgeCarrierLocationPrecision;
  readonly inheritedRouteUntested: boolean;
  readonly inheritedWarningWithoutExactRoute: boolean;
  readonly inheritedRoutineWithoutPractice: boolean;
  readonly localMismatchRisk: NormalizedIntensity;
  readonly lastUsedTick?: TickNumber;
  readonly lastTestedTick?: TickNumber;
  readonly lastUsedYear?: number;
  readonly evidenceRefs: readonly KnowledgeCarrierEvidenceRef[];
  readonly linkedSystemRefs: readonly string[];
  readonly behaviorHook: KnowledgeCarrierBehaviorHook;
  readonly boundedness: {
    readonly noSkillUnlocked: true;
    readonly noTechTree: true;
    readonly noCultureSystem: true;
    readonly noDecisionInfluence: true;
    readonly projectionOnly: true;
  };
}

export interface KnowledgeCarrierPublicCard {
  readonly id: string;
  readonly title: string;
  readonly domain: KnowledgeCarrierDomain;
  readonly state: KnowledgeAvailabilityState;
  readonly oneLineMeaning: string;
  readonly carrierChips: readonly KnowledgeCarrierClass[];
  readonly availabilityLabel: string;
  readonly evidenceChips: readonly string[];
  readonly technicalItemId: string;
}

export interface KnowledgeCarrierProfile {
  readonly bandId: BandId;
  readonly generatedAtTick: TickNumber;
  readonly generatedAtYear: number;
  readonly projectionMode: "selected_band_projection";
  readonly overviewTitle: string;
  readonly overviewLines: readonly string[];
  readonly items: readonly KnowledgeCarrierItem[];
  readonly publicCards: readonly KnowledgeCarrierPublicCard[];
  readonly domainsCovered: readonly KnowledgeCarrierDomain[];
  readonly carrierClassesUsed: readonly KnowledgeCarrierClass[];
  readonly stateCounts: Readonly<Record<KnowledgeAvailabilityState, number>>;
  readonly carrierCounts: Readonly<Record<KnowledgeCarrierClass, number>>;
  readonly domainCounts: Readonly<Record<KnowledgeCarrierDomain, number>>;
  readonly activeItemCount: number;
  readonly fadingItemCount: number;
  readonly dormantItemCount: number;
  readonly distortedItemCount: number;
  readonly inheritedFragmentCount: number;
  readonly copiedUntestedCount: number;
  readonly locallyUntestedCount: number;
  readonly lostOrUnavailableCount: number;
  readonly localOnlyItemCount: number;
  readonly livedItemCount: number;
  readonly inheritedItemCount: number;
  readonly copiedItemCount: number;
  readonly behaviorHooksCount: number;
  readonly maxBehaviorInfluence: 0;
  readonly daughterBottleneckHooks: {
    readonly inheritedFragmentState: boolean;
    readonly parentSourceCarrier: boolean;
    readonly daughterLocalTestingNeededCount: number;
    readonly inheritanceConfidenceLossRepresented: boolean;
    readonly exactTileVsRegionFuzzinessCount: number;
    readonly untestedInheritedRouteCount: number;
    readonly inheritedWarningWithoutExactRouteCount: number;
    readonly inheritedRoutineWithoutPracticeCount: number;
    readonly localMismatchRiskCount: number;
    readonly nextPassReady: true;
    readonly noFissionBehaviorChange: true;
  };
  readonly interBandDiffusionHooks: {
    readonly visibleTraceCount: number;
    readonly socialTraceCount: number;
    readonly copiedUntestedCount: number;
    readonly copiedFailedCount: number;
    readonly copiedLocalOnlyCount: number;
    readonly trustCautionFilterCount: number;
    readonly sourceUnknownCount: number;
    readonly heardWarningNotPersonallyTestedCount: number;
    readonly nextPassReady: true;
    readonly noActualDiffusionImplemented: true;
  };
  readonly caps: {
    readonly itemCap: number;
    readonly itemsPerDomainCap: number;
    readonly carriersPerItemCap: number;
    readonly evidencePerItemCap: number;
    readonly linkedSystemPerItemCap: number;
    readonly publicCardCap: number;
    readonly technicalRefCap: number;
    readonly capsHeld: boolean;
  };
  readonly integrity: {
    readonly selectedBandOnly: true;
    readonly projectionOnly: true;
    readonly noBehaviorInfluence: true;
    readonly noDecisionInfluence: true;
    readonly noNewEcology: true;
    readonly noCultureReligionMythLawPropertyTerritoryTradeAgricultureWar: true;
    readonly noNamedPeople: true;
    readonly noSkillUnlocks: true;
    readonly dormantDoesNotDelete: boolean;
    readonly inheritedSeparatedFromLived: boolean;
    readonly copiedUntestedSeparatedFromPracticed: boolean;
    readonly localOnlyNotGlobalSkill: boolean;
    readonly distortionBoundedEvidenceBased: boolean;
  };
  readonly technicalProof: {
    readonly payloadBytesEstimate: number;
    readonly maxItemPayloadBytes: number;
    readonly exactStateEnums: readonly KnowledgeAvailabilityState[];
    readonly exactCarrierClasses: readonly KnowledgeCarrierClass[];
    readonly sourceSystemCounts: Readonly<Record<KnowledgeCarrierSourceSystem, number>>;
    readonly sourceIdSamples: readonly string[];
    readonly itemIdSamples: readonly string[];
    readonly technicalRefs: readonly string[];
    readonly brokenRefs: 0;
    readonly behaviorHookCap: 0;
    readonly performanceMode: "lazy_selected_band_projection";
    readonly hotPathSafe: true;
  };
}

interface KnowledgeCarrierProfileCacheEntry {
  readonly band: Band;
  readonly tick: TickNumber;
  readonly year: number;
  readonly profile: KnowledgeCarrierProfile;
}

const profileCacheByWorld = new WeakMap<WorldState, Map<BandId, KnowledgeCarrierProfileCacheEntry>>();

interface KnowledgeCarrierDraft {
  readonly sourceKey: string;
  readonly domain: KnowledgeCarrierDomain;
  readonly label: string;
  readonly publicTitle: string;
  readonly humanMeaning: string;
  readonly state: KnowledgeAvailabilityState;
  readonly carrierClasses: readonly KnowledgeCarrierClass[];
  readonly strength: NormalizedIntensity;
  readonly availability: NormalizedIntensity;
  readonly decayPressure: NormalizedIntensity;
  readonly dormancyReason?: string;
  readonly distortionRisk?: string;
  readonly localOnly: boolean;
  readonly sourceBasis: KnowledgeCarrierSourceBasis;
  readonly parentSourceBandId?: BandId;
  readonly daughterLocalTestingNeeded: boolean;
  readonly inheritanceConfidenceLoss: NormalizedIntensity;
  readonly locationPrecision: KnowledgeCarrierLocationPrecision;
  readonly inheritedRouteUntested: boolean;
  readonly inheritedWarningWithoutExactRoute: boolean;
  readonly inheritedRoutineWithoutPractice: boolean;
  readonly localMismatchRisk: NormalizedIntensity;
  readonly lastUsedTick?: TickNumber;
  readonly lastTestedTick?: TickNumber;
  readonly lastUsedYear?: number;
  readonly evidenceRefs: readonly KnowledgeCarrierEvidenceRef[];
  readonly linkedSystemRefs: readonly string[];
  readonly behaviorHook: KnowledgeCarrierBehaviorHook["hook"];
}

export const KNOWLEDGE_CARRIER_DOMAINS: readonly KnowledgeCarrierDomain[] = [
  "route_corridor",
  "crossing_ford",
  "place_camp_country",
  "food_work",
  "water_refuge",
  "risk_caution",
  "material_practice",
  "camp_care",
  "social_contact_diffusion",
  "range_rotation_pressure_relief",
  "deep_history_inherited",
  "local_routine_adaptive_practice",
];

export const KNOWLEDGE_AVAILABILITY_STATES: readonly KnowledgeAvailabilityState[] = [
  "active_practiced",
  "fresh_observed",
  "recently_tested",
  "fading",
  "dormant",
  "distorted",
  "inherited_fragment",
  "copied_untested",
  "locally_untested",
  "blocked_by_context",
  "lost_or_unavailable",
];

export const KNOWLEDGE_CARRIER_CLASSES: readonly KnowledgeCarrierClass[] = [
  "recent_practice",
  "repeated_route_use",
  "repeated_crossing_use",
  "camp_place_memory",
  "seasonal_round",
  "local_routine",
  "event_memory",
  "failed_attempt_memory",
  "successful_attempt_memory",
  "adaptive_response_memory",
  "parent_inheritance",
  "daughter_founding_fragment",
  "social_trace",
  "visible_trace",
  "activity_party_memory",
  "aggregate_elder_adult_memory",
  "technical_only_projection",
];

const SOURCE_SYSTEMS: readonly KnowledgeCarrierSourceSystem[] = [
  "knowledge_ecology",
  "resource_patch_memory",
  "material_affordance",
  "camp_foothold",
  "camp_movement",
  "social_diffusion",
  "adaptive_human",
  "canonical_event",
  "deep_history",
  "reported_knowledge",
];

export function deriveKnowledgeCarrierProfile(world: WorldState, band: Band): KnowledgeCarrierProfile {
  const cachedByBand = profileCacheByWorld.get(world);
  const cached = cachedByBand?.get(band.id);
  if (
    cached !== undefined &&
    cached.band === band &&
    cached.tick === world.time.tick &&
    cached.year === world.time.year
  ) {
    return cached.profile;
  }

  const profile = deriveKnowledgeCarrierProfileUncached(world, band);
  const nextByBand = cachedByBand ?? new Map<BandId, KnowledgeCarrierProfileCacheEntry>();
  nextByBand.set(band.id, {
    band,
    tick: world.time.tick,
    year: world.time.year,
    profile,
  });
  if (cachedByBand === undefined) {
    profileCacheByWorld.set(world, nextByBand);
  }
  return profile;
}

function deriveKnowledgeCarrierProfileUncached(world: WorldState, band: Band): KnowledgeCarrierProfile {
  const knowledge = deriveKnowledgeEcologyProfile(world, band);
  const social = deriveSocialEcologicalDiffusionProfile(world, band);
  const adaptive = deriveAdaptiveHumanProfile(world, band);
  const camp = deriveCampMovementProfile(world, band);
  const material = deriveMaterialAffordanceProfile(world, band);
  const foothold = deriveCampFootholdProfile(world, band);
  const events = deriveCanonicalEvents(world, band);
  const currentTick = Number(world.time.tick);
  const currentYear = world.time.year;
  const drafts = [
    ...selectKnowledgeCarrierDrafts(knowledge.items.map((item) => draftFromKnowledgeItem(band, item, currentYear)), 10),
    ...resourceMemoryDrafts(band, currentTick),
    ...selectKnowledgeCarrierDrafts(material.items.map((item) => makeDraft({
      sourceKey: item.id,
      domain: "material_practice",
      label: item.publicLabel,
      publicTitle: item.publicLabel,
      humanMeaning: item.status === "unsupported_by_current_data"
        ? "The clue exists as a weak material possibility, not a dependable practice."
        : item.meaning,
      state: item.livedBasis === "inherited_not_lived"
        ? "inherited_fragment"
        : item.status === "unsupported_by_current_data"
          ? "locally_untested"
          : "fresh_observed",
      carrierClasses: addAggregateMemoryCarrier(band, [
        "visible_trace",
        "technical_only_projection",
      ]),
      strength: item.confidence,
      availability: item.status === "unsupported_by_current_data" ? item.confidence * 0.55 : item.confidence,
      decayPressure: item.livedBasis === "inherited_not_lived" ? 0.36 : 0.14,
      distortionRisk: item.status === "unsupported_by_current_data" ? "A material hint can miss the local handling step." : undefined,
      localOnly: false,
      sourceBasis: item.livedBasis === "inherited_not_lived" ? "inherited" : "lived",
      daughterLocalTestingNeeded: item.livedBasis === "inherited_not_lived",
      inheritanceConfidenceLoss: item.livedBasis === "inherited_not_lived" ? 0.28 : 0,
      locationPrecision: firstEvidenceTile(item.evidence) === undefined ? "none" : "approximate_tile",
      inheritedRouteUntested: false,
      inheritedWarningWithoutExactRoute: false,
      inheritedRoutineWithoutPractice: item.livedBasis === "inherited_not_lived",
      localMismatchRisk: item.constraints.length > 0 ? clamp01(item.constraints[0]?.severity ?? 0.2) : 0.12,
      evidenceRefs: item.evidence.slice(0, EVIDENCE_PER_ITEM_CAP).map((entry) => ({
        sourceSystem: "material_affordance",
        sourceId: entry.sourceId,
        label: entry.label,
        confidence: entry.confidence,
        tileId: entry.tileId,
        routeId: entry.routeId,
        reasonIds: entry.reasonIds,
      })),
      linkedSystemRefs: [item.id, ...item.futureHooks],
      behaviorHook: "future_adaptive_practice_confidence_filter",
    })), 3),
    ...selectKnowledgeCarrierDrafts(foothold.factors.map((factor) => makeDraft({
      sourceKey: factor.id,
      domain: "camp_care",
      label: factor.publicLabel,
      publicTitle: factor.publicLabel,
      humanMeaning: factor.meaning,
      state: factor.livedBasis === "inherited_not_lived" ? "inherited_fragment" : "fresh_observed",
      carrierClasses: addAggregateMemoryCarrier(band, ["camp_place_memory", "activity_party_memory"]),
      strength: factor.confidence,
      availability: factor.livedBasis === "inherited_not_lived" ? factor.confidence * 0.62 : factor.confidence,
      decayPressure: factor.livedBasis === "inherited_not_lived" ? 0.34 : 0.12,
      distortionRisk: factor.livedBasis === "inherited_not_lived" ? "The camp lesson came from parent memory and may not fit this place." : undefined,
      localOnly: true,
      sourceBasis: factor.livedBasis === "inherited_not_lived" ? "inherited" : "lived",
      daughterLocalTestingNeeded: factor.livedBasis === "inherited_not_lived",
      inheritanceConfidenceLoss: factor.livedBasis === "inherited_not_lived" ? 0.3 : 0,
      locationPrecision: "approximate_tile",
      inheritedRouteUntested: false,
      inheritedWarningWithoutExactRoute: false,
      inheritedRoutineWithoutPractice: factor.livedBasis === "inherited_not_lived",
      localMismatchRisk: factor.livedBasis === "inherited_not_lived" ? 0.44 : 0.2,
      evidenceRefs: factor.evidence.slice(0, EVIDENCE_PER_ITEM_CAP).map((entry) => ({
        sourceSystem: "camp_foothold",
        sourceId: entry.sourceId,
        label: entry.label,
        confidence: entry.confidence,
        tileId: entry.tileId,
        reasonIds: entry.reasonIds,
      })),
      linkedSystemRefs: [factor.id, ...factor.relatedKnowledgeIds, ...factor.relatedEventIds],
      behaviorHook: "future_adaptive_practice_confidence_filter",
    })), 2),
    ...campMovementDrafts(band, camp),
    ...selectKnowledgeCarrierDrafts(social.diffusionItems.map((item) => draftFromSocialDiffusionItem(band, item)), 5),
    ...selectKnowledgeCarrierDrafts(adaptive.ideas.map((idea) => draftFromAdaptiveIdea(band, idea)), 4),
    ...selectKnowledgeCarrierDrafts(adaptive.attempts.map((attempt) => draftFromAttempt(attempt)), 3),
    ...selectKnowledgeCarrierDrafts(adaptive.localRoutines.map((routine) => draftFromRoutine(routine, currentTick)), 4),
    ...selectKnowledgeCarrierDrafts(adaptive.contextBoundAdaptations.map((adaptation) => draftFromAdaptation(adaptation)), 2),
    ...selectKnowledgeCarrierDrafts(adaptive.variants.map((variant) => draftFromVariant(variant)), 2),
    ...selectKnowledgeCarrierDrafts(events.events.map((event) => makeDraft({
      sourceKey: event.id,
      domain: event.memoryScope === "inherited" ? "deep_history_inherited" : eventDomain(event.family),
      label: event.title,
      publicTitle: event.title,
      humanMeaning: event.memoryScope === "inherited"
        ? "This event is carried as inherited or older memory, not direct local proof."
        : event.summary,
      state: event.memoryScope === "inherited"
        ? "inherited_fragment"
        : event.memoryScope === "durable" && currentYear - event.endYear >= 18
          ? "dormant"
          : "fresh_observed",
      carrierClasses: addAggregateMemoryCarrier(band, [
        "event_memory",
        event.livedStatus === "inherited_not_personally_lived" ? "parent_inheritance" : "technical_only_projection",
      ]),
      strength: event.significance,
      availability: event.memoryScope === "inherited" ? event.significance * 0.58 : event.significance,
      decayPressure: event.memoryScope === "durable" ? decayFromYears(currentYear - event.endYear) : 0.08,
      dormancyReason: event.memoryScope === "durable" && currentYear - event.endYear >= 18
        ? "The event remains in the record, but it is old enough to be background memory."
        : undefined,
      distortionRisk: event.memoryScope === "inherited" ? "Inherited event memory can lose exact place or season." : undefined,
      localOnly: false,
      sourceBasis: event.livedStatus === "inherited_not_personally_lived" ? "inherited" : "lived",
      parentSourceBandId: band.parentBandId,
      daughterLocalTestingNeeded: event.livedStatus === "inherited_not_personally_lived",
      inheritanceConfidenceLoss: event.livedStatus === "inherited_not_personally_lived" ? 0.35 : 0,
      locationPrecision: event.involvedTileIds.length > 0 ? "exact_tile" : "region_fuzzy",
      inheritedRouteUntested: event.livedStatus === "inherited_not_personally_lived" && event.involvedRouteIds.length > 0,
      inheritedWarningWithoutExactRoute: event.livedStatus === "inherited_not_personally_lived" && event.involvedRouteIds.length === 0,
      inheritedRoutineWithoutPractice: event.livedStatus === "inherited_not_personally_lived",
      localMismatchRisk: event.livedStatus === "inherited_not_personally_lived" ? 0.4 : 0.1,
      evidenceRefs: [{
        sourceSystem: "canonical_event",
        sourceId: event.id,
        label: event.title,
        confidence: event.significance,
        tileId: event.involvedTileIds[0],
        routeId: event.involvedRouteIds[0],
        lastUsedYear: event.endYear,
        reasonIds: event.sourceReasonIds.slice(0, EVIDENCE_PER_ITEM_CAP),
      }],
      linkedSystemRefs: [event.id, ...event.chronicleLinkIds],
      behaviorHook: event.memoryScope === "inherited" ? "future_daughter_inheritance_filter" : "future_candidate_confidence_filter",
    })), 3),
    ...reportedKnowledgeLossDrafts(band),
  ];
  const items = capAndFinalizeDrafts(band, drafts);
  const publicCards = makePublicCards(items);
  const stateCounts = countBy(KNOWLEDGE_AVAILABILITY_STATES, items.map((item) => item.state));
  const carrierCounts = countBy(KNOWLEDGE_CARRIER_CLASSES, items.flatMap((item) => item.carrierClasses));
  const domainCounts = countBy(KNOWLEDGE_CARRIER_DOMAINS, items.map((item) => item.domain));
  const sourceCounts = countBy(SOURCE_SYSTEMS, items.flatMap((item) => item.evidenceRefs.map((entry) => entry.sourceSystem)));
  const allEvidence = items.flatMap((item) => item.evidenceRefs);
  const payloadDraft = {
    bandId: band.id,
    generatedAtTick: Number(world.time.tick),
    generatedAtYear: currentYear,
    items,
    publicCards,
  };
  const itemPayloads = items.map((item) => byteLengthUtf8(JSON.stringify(item)));

  return {
    bandId: band.id,
    generatedAtTick: world.time.tick,
    generatedAtYear: currentYear,
    projectionMode: "selected_band_projection",
    overviewTitle: overviewTitle(items),
    overviewLines: overviewLines(items),
    items,
    publicCards,
    domainsCovered: KNOWLEDGE_CARRIER_DOMAINS.filter((domain) => domainCounts[domain] > 0),
    carrierClassesUsed: KNOWLEDGE_CARRIER_CLASSES.filter((carrier) => carrierCounts[carrier] > 0),
    stateCounts,
    carrierCounts,
    domainCounts,
    activeItemCount: stateCounts.active_practiced + stateCounts.recently_tested + stateCounts.fresh_observed,
    fadingItemCount: stateCounts.fading,
    dormantItemCount: stateCounts.dormant,
    distortedItemCount: stateCounts.distorted,
    inheritedFragmentCount: stateCounts.inherited_fragment,
    copiedUntestedCount: stateCounts.copied_untested,
    locallyUntestedCount: stateCounts.locally_untested,
    lostOrUnavailableCount: stateCounts.lost_or_unavailable,
    localOnlyItemCount: items.filter((item) => item.localOnly).length,
    livedItemCount: items.filter((item) => item.sourceBasis === "lived" || item.sourceBasis === "mixed").length,
    inheritedItemCount: items.filter((item) => item.inherited).length,
    copiedItemCount: items.filter((item) => item.copied).length,
    behaviorHooksCount: items.length,
    maxBehaviorInfluence: 0,
    daughterBottleneckHooks: {
      inheritedFragmentState: items.some((item) => item.state === "inherited_fragment"),
      parentSourceCarrier: items.some((item) => item.carrierClasses.includes("parent_inheritance")),
      daughterLocalTestingNeededCount: items.filter((item) => item.daughterLocalTestingNeeded).length,
      inheritanceConfidenceLossRepresented: items.some((item) => item.inheritanceConfidenceLoss > 0),
      exactTileVsRegionFuzzinessCount: items.filter((item) => item.locationPrecision === "region_fuzzy").length,
      untestedInheritedRouteCount: items.filter((item) => item.inheritedRouteUntested).length,
      inheritedWarningWithoutExactRouteCount: items.filter((item) => item.inheritedWarningWithoutExactRoute).length,
      inheritedRoutineWithoutPracticeCount: items.filter((item) => item.inheritedRoutineWithoutPractice).length,
      localMismatchRiskCount: items.filter((item) => item.localMismatchRisk >= 0.35).length,
      nextPassReady: true,
      noFissionBehaviorChange: true,
    },
    interBandDiffusionHooks: {
      visibleTraceCount: items.filter((item) => item.carrierClasses.includes("visible_trace")).length,
      socialTraceCount: items.filter((item) => item.carrierClasses.includes("social_trace")).length,
      copiedUntestedCount: stateCounts.copied_untested,
      copiedFailedCount: items.filter((item) => item.state === "distorted" && item.copied).length,
      copiedLocalOnlyCount: items.filter((item) => item.copied && item.localOnly).length,
      trustCautionFilterCount: social.diffusionItems.filter((item) =>
        item.trustFilter === "cautious_hearsay" ||
        item.trustFilter === "source_unknown" ||
        item.trustFilter === "inherited_caution" ||
        item.trustFilter === "tense_contact").length,
      sourceUnknownCount: social.diffusionItems.filter((item) => item.trustFilter === "source_unknown").length,
      heardWarningNotPersonallyTestedCount: items.filter((item) =>
        item.state === "copied_untested" ||
        item.state === "locally_untested" ||
        item.humanMeaning.includes("not been tested")).length,
      nextPassReady: true,
      noActualDiffusionImplemented: true,
    },
    caps: {
      itemCap: PROFILE_ITEM_CAP,
      itemsPerDomainCap: ITEMS_PER_DOMAIN_CAP,
      carriersPerItemCap: CARRIERS_PER_ITEM_CAP,
      evidencePerItemCap: EVIDENCE_PER_ITEM_CAP,
      linkedSystemPerItemCap: LINKED_SYSTEM_PER_ITEM_CAP,
      publicCardCap: PUBLIC_CARD_CAP,
      technicalRefCap: TECHNICAL_REF_CAP,
      capsHeld: items.length <= PROFILE_ITEM_CAP &&
        publicCards.length <= PUBLIC_CARD_CAP &&
        KNOWLEDGE_CARRIER_DOMAINS.every((domain) => items.filter((item) => item.domain === domain).length <= ITEMS_PER_DOMAIN_CAP) &&
        items.every((item) =>
          item.carrierClasses.length <= CARRIERS_PER_ITEM_CAP &&
          item.evidenceRefs.length <= EVIDENCE_PER_ITEM_CAP &&
          item.linkedSystemRefs.length <= LINKED_SYSTEM_PER_ITEM_CAP),
    },
    integrity: {
      selectedBandOnly: true,
      projectionOnly: true,
      noBehaviorInfluence: true,
      noDecisionInfluence: true,
      noNewEcology: true,
      noCultureReligionMythLawPropertyTerritoryTradeAgricultureWar: true,
      noNamedPeople: true,
      noSkillUnlocks: true,
      dormantDoesNotDelete: items.every((item) => item.state !== "dormant" || item.evidenceRefs.length > 0),
      inheritedSeparatedFromLived: items.every((item) => !item.inherited || item.sourceBasis === "inherited" || item.sourceBasis === "mixed"),
      copiedUntestedSeparatedFromPracticed: items.every((item) => item.state !== "copied_untested" || !item.carrierClasses.includes("recent_practice")),
      localOnlyNotGlobalSkill: items.every((item) => !item.localOnly || item.boundedness.noSkillUnlocked),
      distortionBoundedEvidenceBased: items.every((item) => item.state !== "distorted" || item.distortionRisk !== undefined && item.evidenceRefs.length > 0),
    },
    technicalProof: {
      payloadBytesEstimate: byteLengthUtf8(JSON.stringify(payloadDraft)),
      maxItemPayloadBytes: Math.max(0, ...itemPayloads),
      exactStateEnums: KNOWLEDGE_AVAILABILITY_STATES,
      exactCarrierClasses: KNOWLEDGE_CARRIER_CLASSES,
      sourceSystemCounts: sourceCounts,
      sourceIdSamples: uniqueStrings(allEvidence.map((entry) => entry.sourceId)).slice(0, TECHNICAL_REF_CAP),
      itemIdSamples: items.map((item) => item.id).slice(0, TECHNICAL_REF_CAP),
      technicalRefs: uniqueStrings(items.flatMap((item) => item.linkedSystemRefs)).slice(0, TECHNICAL_REF_CAP),
      brokenRefs: 0,
      behaviorHookCap: 0,
      performanceMode: "lazy_selected_band_projection",
      hotPathSafe: true,
    },
  };
}

function draftFromKnowledgeItem(
  band: Band,
  item: KnowledgeEcologyItem,
  currentYear: number,
): KnowledgeCarrierDraft {
  const ageYears = item.lastReinforcedYear === undefined
    ? item.memoryScope === "durable" ? 14 : 0
    : Math.max(0, currentYear - item.lastReinforcedYear);
  const inherited = item.livedStatus === "inherited_not_personally_lived";
  const decayPressure = inherited ? Math.max(0.34, decayFromYears(ageYears)) : decayFromYears(ageYears);
  const state = classifyKnowledgeEcologyState(item, ageYears);
  const availability = availabilityFor(state, item.confidence, decayPressure);
  const domain = mapKnowledgeDomain(item.domain);

  return makeDraft({
    sourceKey: item.id,
    domain,
    label: item.title,
    publicTitle: item.title,
    humanMeaning: meaningForState(state, item.summary),
    state,
    carrierClasses: carriersForKnowledgeItem(band, item),
    strength: item.confidence,
    availability,
    decayPressure,
    dormancyReason: state === "dormant" ? "The knowledge remains in memory, but recent evidence is too weak for automatic trust." : undefined,
    distortionRisk: distortionRiskForKnowledgeItem(item, state),
    localOnly: item.domain === "place_country" || item.domain === "food_work" || item.domain === "water_refuge",
    sourceBasis: inherited ? "inherited" : item.practicalStatus === "heard_about" ? "mixed" : "lived",
    parentSourceBandId: inherited ? band.parentBandId : undefined,
    daughterLocalTestingNeeded: inherited || item.practicalStatus === "inherited_not_practiced",
    inheritanceConfidenceLoss: inherited ? 0.32 : 0,
    locationPrecision: inherited ? "region_fuzzy" : item.involvedTileIds.length > 0 ? "exact_tile" : "none",
    inheritedRouteUntested: inherited && item.domain === "route_corridor" && item.practicalStatus !== "practical",
    inheritedWarningWithoutExactRoute: inherited && item.domain === "risk_caution" && item.involvedRouteIds.length === 0,
    inheritedRoutineWithoutPractice: inherited && item.practicalStatus !== "practical",
    localMismatchRisk: inherited ? 0.42 : item.fading ? 0.32 : item.practicalStatus === "heard_about" ? 0.28 : 0.12,
    lastUsedYear: item.lastReinforcedYear,
    evidenceRefs: item.evidence.map((entry) => ({
      sourceSystem: "knowledge_ecology",
      sourceId: entry.sourceId,
      label: entry.label,
      confidence: entry.confidence,
      stateHint: item.practicalStatus,
      tileId: entry.tileId,
      routeId: entry.routeId,
      lastUsedYear: item.lastReinforcedYear,
      reasonIds: entry.reasonIds,
    })),
    linkedSystemRefs: [item.id, ...item.relatedEventIds, ...item.relatedChronicleLinkIds],
    behaviorHook: inherited ? "future_daughter_inheritance_filter" : item.domain === "social_contact" ? "future_social_diffusion_filter" : "future_candidate_confidence_filter",
  });
}

function resourceMemoryDrafts(band: Band, currentTick: number): readonly KnowledgeCarrierDraft[] {
  return selectKnowledgeCarrierDrafts([...(band.resourceKnowledgeState?.patchMemories ?? [])]
    .sort((left, right) =>
      Number(right.lastNotedTick) - Number(left.lastNotedTick) ||
      String(left.patchId).localeCompare(String(right.patchId)))
    .map((memory) => draftFromResourceMemory(memory, currentTick)), 3);
}

function draftFromResourceMemory(memory: ResourcePatchMemory, currentTick: number): KnowledgeCarrierDraft {
  const effective = effectiveResourceConfidence(memory, currentTick);
  const effectiveConfidence = resourceEffectiveConfidence(effective);
  const state: KnowledgeAvailabilityState = effective.label === "fresh"
    ? memory.useHistory.successfulUses > 0 ? "recently_tested" : "fresh_observed"
    : effective.label === "stale"
      ? "fading"
      : effective.label === "remembered_location_only"
        ? "lost_or_unavailable"
        : "dormant";
  const inherited = memory.source === "inherited" || memory.transmission.inheritedFromParent === true;
  const copied = memory.source === "encounter_shared" || memory.source === "rumored" || memory.source === "absorbed";
  const risk = memory.risk.badWater || memory.risk.poisoningOrBadReaction || memory.risk.predatorOrAnimalRisk > 0.4;

  return makeDraft({
    sourceKey: String(memory.patchId),
    domain: risk ? "risk_caution" : "food_work",
    label: `${memory.resourceClassId} memory`,
    publicTitle: risk ? "Old food warning is carried separately" : "Food-place memory can fade",
    humanMeaning: state === "lost_or_unavailable"
      ? "They still have a remembered place, but not enough usable detail to trust the food work."
      : state === "dormant"
        ? "The old food place is remembered, but no one has tested it recently."
        : risk
          ? "The warning is kept as caution rather than a reliable way to use the place."
          : "Food work memory is tied to a remembered patch and recent use detail.",
    state,
    carrierClasses: uniqueCarriers([
      memory.useHistory.successfulUses > 0 ? "recent_practice" : "camp_place_memory",
      memory.useHistory.failedUses > 0 || risk ? "failed_attempt_memory" : "activity_party_memory",
      inherited ? "parent_inheritance" : "technical_only_projection",
    ]),
    strength: effectiveConfidence,
    availability: state === "lost_or_unavailable" ? Math.min(0.24, effectiveConfidence) : effectiveConfidence,
    decayPressure: clamp01(effective.stalenessTicks / 96),
    dormancyReason: state === "dormant" || state === "lost_or_unavailable"
      ? "Resource memory is retained, but usable season/yield detail has decayed."
      : undefined,
    distortionRisk: effective.isStale ? "The remembered resource may have the wrong season, yield, or confidence." : undefined,
    localOnly: true,
    sourceBasis: inherited ? "inherited" : copied ? "copied" : "lived",
    parentSourceBandId: memory.transmission.sourceBandId,
    daughterLocalTestingNeeded: inherited,
    inheritanceConfidenceLoss: inherited ? Math.max(0.2, memory.transmission.detailLoss) : 0,
    locationPrecision: inherited ? "region_fuzzy" : "approximate_tile",
    inheritedRouteUntested: false,
    inheritedWarningWithoutExactRoute: inherited && risk && memory.linkedCorridorId === undefined,
    inheritedRoutineWithoutPractice: inherited && memory.transmission.practiceReinforced === 0,
    localMismatchRisk: clamp01(memory.transmission.detailLoss + (effective.isStale ? 0.24 : 0) + (copied ? 0.18 : 0)),
    lastUsedTick: memory.useHistory.lastUsedTick,
    lastTestedTick: memory.lastNotedTick,
    evidenceRefs: [{
      sourceSystem: "resource_patch_memory",
      sourceId: String(memory.patchId),
      label: `${memory.state} ${memory.resourceClassId} at ${String(memory.approximateTile)}`,
      confidence: effectiveConfidence,
      stateHint: effective.label,
      tileId: memory.approximateTile,
      routeId: memory.linkedCorridorId,
      lastUsedTick: memory.useHistory.lastUsedTick,
      lastTestedTick: memory.lastNotedTick,
      reasonIds: memory.reasonIds,
    }],
    linkedSystemRefs: [String(memory.patchId), memory.resourceClassId, memory.linkedCorridorId === undefined ? "no-corridor" : String(memory.linkedCorridorId)],
    behaviorHook: "future_adaptive_practice_confidence_filter",
  });
}

function campMovementDrafts(
  band: Band,
  camp: ReturnType<typeof deriveCampMovementProfile>,
): readonly KnowledgeCarrierDraft[] {
  const range = camp.rangeRotation;
  const chosen = range.chosenCandidate;
  const drafts: KnowledgeCarrierDraft[] = [];

  if (chosen !== undefined) {
    drafts.push(makeDraft({
      sourceKey: chosen.id,
      domain: "range_rotation_pressure_relief",
      label: chosen.reasonLabel,
      publicTitle: "Pressure relief knowledge is local",
      humanMeaning: chosen.actionStrategy === "move_to_tile"
        ? "They trust this relief place enough for a bounded move, but only in this local range."
        : "They can point to a possible relief place, but it still needs testing.",
      state: chosen.actionStrategy === "move_to_tile" ? "recently_tested" : "locally_untested",
      carrierClasses: ["camp_place_memory", "visible_trace", "technical_only_projection"],
      strength: chosen.pressureReliefScore,
      availability: chosen.actionStrategy === "move_to_tile" ? chosen.pressureReliefScore : chosen.pressureReliefScore * 0.62,
      decayPressure: chosen.uncertainty,
      distortionRisk: chosen.uncertainty > 0.45 ? "The relief place may be overvalued because support or water has not been checked enough." : undefined,
      localOnly: true,
      sourceBasis: "lived",
      daughterLocalTestingNeeded: false,
      inheritanceConfidenceLoss: 0,
      locationPrecision: "exact_tile",
      inheritedRouteUntested: false,
      inheritedWarningWithoutExactRoute: false,
      inheritedRoutineWithoutPractice: false,
      localMismatchRisk: chosen.uncertainty,
      evidenceRefs: chosen.evidenceRefs.map((entry) => ({
        sourceSystem: "camp_movement",
        sourceId: entry.sourceId,
        label: entry.label,
        confidence: entry.confidence,
        tileId: entry.tileId,
        reasonIds: entry.reasonIds,
      })),
      linkedSystemRefs: [chosen.id, range.currentLocalRangeId],
      behaviorHook: "future_range_rotation_confidence_filter",
    }));
  }

  if (camp.currentEstablishment !== undefined) {
    const establishment = camp.currentEstablishment;
    drafts.push(makeDraft({
      sourceKey: establishment.id,
      domain: "place_camp_country",
      label: establishment.status,
      publicTitle: "New place knowledge is still being tested",
      humanMeaning: establishment.status === "established"
        ? "The camp place is practiced locally, but its confidence still belongs to this place."
        : "The place is remembered and being tried, not yet a fully trusted home ground.",
      state: establishment.status === "established" ? "active_practiced" : "locally_untested",
      carrierClasses: ["camp_place_memory", "recent_practice", "activity_party_memory"],
      strength: establishment.confidence,
      availability: establishment.confidence,
      decayPressure: establishment.retreatRisk,
      distortionRisk: establishment.blockedReasons.length > 0 ? "Recent blocks can make the camp lesson less portable." : undefined,
      localOnly: true,
      sourceBasis: "lived",
      daughterLocalTestingNeeded: false,
      inheritanceConfidenceLoss: 0,
      locationPrecision: "exact_tile",
      inheritedRouteUntested: false,
      inheritedWarningWithoutExactRoute: false,
      inheritedRoutineWithoutPractice: false,
      localMismatchRisk: establishment.retreatRisk,
      lastTestedTick: establishment.startedTick,
      evidenceRefs: establishment.evidenceRefs.map((entry) => ({
        sourceSystem: "camp_movement",
        sourceId: entry.sourceId,
        label: entry.label,
        confidence: entry.confidence,
        tileId: entry.tileId,
        reasonIds: entry.reasonIds,
      })),
      linkedSystemRefs: [establishment.id, establishment.localClusterId],
      behaviorHook: "future_candidate_confidence_filter",
    }));
  }

  return drafts;
}

function draftFromSocialDiffusionItem(band: Band, item: SocialDiffusionItem): KnowledgeCarrierDraft {
  const state = stateFromSocialDiffusion(item);
  const inherited = item.inheritedVsLocalBasis === "inherited";
  const copied = item.status === "copied_superficially" || item.status === "partial_copy" || item.visibility === "seen" || item.visibility === "trace";

  return makeDraft({
    sourceKey: item.id,
    domain: mapSocialDomain(item.domain),
    label: item.publicLabel,
    publicTitle: item.publicLabel,
    humanMeaning: socialMeaning(item, state),
    state,
    carrierClasses: uniqueCarriers([
      item.visibility === "trace" || item.visibility === "seen" ? "visible_trace" : "social_trace",
      item.channel === "activity_talk" ? "activity_party_memory" : "technical_only_projection",
      inherited ? "parent_inheritance" : "technical_only_projection",
    ]),
    strength: item.confidence,
    availability: availabilityFor(state, item.confidence, item.risks.includes("distorted_or_stale") ? 0.44 : 0.2),
    decayPressure: item.risks.includes("distorted_or_stale") ? 0.48 : item.compatibility === "inherited_from_different_country" ? 0.42 : 0.18,
    distortionRisk: item.risks.length > 0 ? item.risks.map((risk) => risk.replace(/_/g, " ")).join(", ") : undefined,
    localOnly: item.status === "local_only" || item.risks.includes("local_only"),
    sourceBasis: inherited ? "inherited" : copied ? "copied" : item.inheritedVsLocalBasis === "lived_local" ? "lived" : "mixed",
    parentSourceBandId: inherited ? band.parentBandId : item.sourceBandId,
    daughterLocalTestingNeeded: inherited || state === "copied_untested" || state === "locally_untested",
    inheritanceConfidenceLoss: inherited ? 0.34 : 0,
    locationPrecision: item.visibility === "inherited" ? "region_fuzzy" : firstEvidenceTile(item.evidence) === undefined ? "none" : "approximate_tile",
    inheritedRouteUntested: inherited && item.domain === "route_crossing" && item.status !== "tested_locally",
    inheritedWarningWithoutExactRoute: inherited && item.risks.includes("distorted_or_stale"),
    inheritedRoutineWithoutPractice: inherited && item.status !== "tested_locally",
    localMismatchRisk: localMismatchForSocial(item),
    evidenceRefs: item.evidence.map((entry) => ({
      sourceSystem: "social_diffusion",
      sourceId: entry.sourceId,
      label: entry.label,
      confidence: entry.confidence,
      tileId: entry.tileId,
      reasonIds: entry.reasonIds,
    })),
    linkedSystemRefs: [
      item.id,
      ...item.linkedKnowledgeIds,
      ...item.linkedReportIds,
      ...item.linkedEventIds,
      ...item.linkedPracticeFeedbackIds,
    ],
    behaviorHook: "future_social_diffusion_filter",
  });
}

function draftFromAdaptiveIdea(band: Band, idea: AdaptiveIdea): KnowledgeCarrierDraft {
  const inherited = idea.noveltySource === "inherited" || idea.status === "inherited";
  const copied = idea.noveltySource === "copied_seen" || idea.status === "copied";
  const state: KnowledgeAvailabilityState = inherited
    ? "inherited_fragment"
    : copied
      ? "copied_untested"
      : idea.status === "blocked" || idea.status === "rejected"
        ? "blocked_by_context"
        : "fresh_observed";

  return makeDraft({
    sourceKey: idea.id,
    domain: idea.family === "social_copy" ? "social_contact_diffusion" : "local_routine_adaptive_practice",
    label: idea.publicLabel,
    publicTitle: idea.publicLabel,
    humanMeaning: inherited
      ? "The idea was carried from parent memory, but not proved here."
      : copied
        ? "The copied hint is visible, not a practiced routine."
        : idea.meaning,
    state,
    carrierClasses: uniqueCarriers([
      copied ? "social_trace" : "adaptive_response_memory",
      inherited ? "parent_inheritance" : "technical_only_projection",
      idea.status === "chosen" && !copied && !inherited ? "recent_practice" : "technical_only_projection",
    ]),
    strength: idea.feasibility,
    availability: availabilityFor(state, idea.feasibility, copied || inherited ? 0.42 : 0.18),
    decayPressure: copied || inherited ? 0.38 : 0.12,
    distortionRisk: copied ? "Copied hints can miss tacit steps or material context." : inherited ? "Inherited ideas can lose local fit." : undefined,
    localOnly: true,
    sourceBasis: inherited ? "inherited" : copied ? "copied" : "lived",
    parentSourceBandId: inherited ? band.parentBandId : undefined,
    daughterLocalTestingNeeded: inherited,
    inheritanceConfidenceLoss: inherited ? 0.34 : 0,
    locationPrecision: "none",
    inheritedRouteUntested: inherited && idea.family === "route_crossing",
    inheritedWarningWithoutExactRoute: inherited && idea.family === "route_crossing",
    inheritedRoutineWithoutPractice: inherited,
    localMismatchRisk: copied || inherited ? 0.46 : 0.2,
    evidenceRefs: idea.evidence.map((entry) => ({
      sourceSystem: "adaptive_human",
      sourceId: entry.sourceId,
      label: entry.label,
      confidence: entry.confidence,
      tileId: entry.tileId,
      reasonIds: entry.reasonIds,
    })),
    linkedSystemRefs: [
      idea.id,
      ...idea.linkedKnowledgeIds,
      ...idea.linkedSocialDiffusionIds,
      ...idea.linkedPracticeFeedbackIds,
    ],
    behaviorHook: "future_adaptive_practice_confidence_filter",
  });
}

function draftFromAttempt(attempt: SolutionAttempt): KnowledgeCarrierDraft {
  const success = attempt.outcome === "clear_success" || attempt.outcome === "partial_success" || attempt.outcome === "local_only_success";
  const failed = attempt.outcome === "clear_failure" || attempt.outcome === "dead_end" || attempt.outcome === "false_confidence";
  const state: KnowledgeAvailabilityState = attempt.outcome === "local_only_success"
    ? "active_practiced"
    : failed
      ? "distorted"
      : attempt.outcome === "blocked_before_attempt" || attempt.outcome === "too_labor_heavy"
        ? "blocked_by_context"
        : "recently_tested";

  return makeDraft({
    sourceKey: attempt.id,
    domain: "local_routine_adaptive_practice",
    label: attempt.attemptType,
    publicTitle: success ? "A recent attempt can carry practical memory" : "A failed attempt is remembered as caution",
    humanMeaning: success
      ? "The attempt produced local evidence, but it still belongs to this place and group."
      : "The attempt is useful as warning, not as proof of a dependable method.",
    state,
    carrierClasses: [success ? "successful_attempt_memory" : "failed_attempt_memory", "adaptive_response_memory"],
    strength: success ? 0.68 : 0.44,
    availability: success ? 0.62 : 0.34,
    decayPressure: attempt.feedbackQuality === "delayed" || attempt.feedbackQuality === "weak" ? 0.36 : 0.14,
    distortionRisk: failed ? "The attempt can create false confidence if remembered without the failure context." : undefined,
    localOnly: attempt.outcome === "local_only_success",
    sourceBasis: "lived",
    daughterLocalTestingNeeded: false,
    inheritanceConfidenceLoss: 0,
    locationPrecision: "exact_tile",
    inheritedRouteUntested: false,
    inheritedWarningWithoutExactRoute: false,
    inheritedRoutineWithoutPractice: false,
    localMismatchRisk: attempt.outcome === "local_only_success" ? 0.52 : 0.24,
    evidenceRefs: [{
      sourceSystem: "adaptive_human",
      sourceId: attempt.id,
      label: attempt.outcome.replace(/_/g, " "),
      confidence: success ? 0.68 : 0.44,
      tileId: attempt.targetTileId ?? attempt.placeTileId,
      reasonIds: [],
    }],
    linkedSystemRefs: [attempt.id, attempt.ideaId, attempt.responseId, ...attempt.eventRefs],
    behaviorHook: "future_adaptive_practice_confidence_filter",
  });
}

function draftFromRoutine(routine: LocalRoutine, currentTick: number): KnowledgeCarrierDraft {
  const ageTicks = Math.max(0, currentTick - Number(routine.lastUsedTick));
  const state: KnowledgeAvailabilityState = routine.decayRisk === "high" && ageTicks >= 24
    ? "fading"
    : routine.confidenceBand === "locally_reliable"
      ? "active_practiced"
      : routine.confidenceBand === "contradicted"
        ? "distorted"
        : "recently_tested";

  return makeDraft({
    sourceKey: routine.id,
    domain: "local_routine_adaptive_practice",
    label: routine.publicLabel,
    publicTitle: routine.publicLabel,
    humanMeaning: "The routine is a local habit, not a general method.",
    state,
    carrierClasses: ["local_routine", "recent_practice", "adaptive_response_memory"],
    strength: routine.confidence,
    availability: availabilityFor(state, routine.confidence, ageTicks / 80),
    decayPressure: clamp01(ageTicks / 80 + (routine.decayRisk === "high" ? 0.24 : 0)),
    dormancyReason: state === "fading" ? "The routine has not been used recently enough to stay fully active." : undefined,
    distortionRisk: routine.confidenceBand === "contradicted" ? "Contradictory feedback limits the routine." : undefined,
    localOnly: true,
    sourceBasis: "lived",
    daughterLocalTestingNeeded: false,
    inheritanceConfidenceLoss: 0,
    locationPrecision: "none",
    inheritedRouteUntested: false,
    inheritedWarningWithoutExactRoute: false,
    inheritedRoutineWithoutPractice: false,
    localMismatchRisk: routine.transferDifficulty === "high" ? 0.56 : 0.26,
    lastUsedTick: routine.lastUsedTick,
    evidenceRefs: [{
      sourceSystem: "adaptive_human",
      sourceId: routine.id,
      label: `${routine.repetitionCount} repetitions, ${routine.successfulFeedbackCount} useful`,
      confidence: routine.confidence,
      lastUsedTick: routine.lastUsedTick,
      reasonIds: [],
    }],
    linkedSystemRefs: [routine.id, routine.sourceIdeaId, ...routine.mutationHookIds],
    behaviorHook: "future_adaptive_practice_confidence_filter",
  });
}

function draftFromAdaptation(adaptation: ContextBoundAdaptation): KnowledgeCarrierDraft {
  return makeDraft({
    sourceKey: adaptation.id,
    domain: "local_routine_adaptive_practice",
    label: adaptation.publicLabel,
    publicTitle: adaptation.publicLabel,
    humanMeaning: "The practice is explicitly bound to this context and can fail elsewhere.",
    state: adaptation.decayRisk === "high" ? "fading" : "active_practiced",
    carrierClasses: ["local_routine", "adaptive_response_memory", "recent_practice"],
    strength: adaptation.confidence,
    availability: adaptation.confidence,
    decayPressure: adaptation.decayRisk === "high" ? 0.46 : 0.18,
    distortionRisk: adaptation.transferDifficulty === "high" ? "A local routine may be overgeneralized outside its place." : undefined,
    localOnly: true,
    sourceBasis: "lived",
    daughterLocalTestingNeeded: false,
    inheritanceConfidenceLoss: 0,
    locationPrecision: "none",
    inheritedRouteUntested: false,
    inheritedWarningWithoutExactRoute: false,
    inheritedRoutineWithoutPractice: false,
    localMismatchRisk: adaptation.transferDifficulty === "high" ? 0.58 : 0.28,
    evidenceRefs: [{
      sourceSystem: "adaptive_human",
      sourceId: adaptation.id,
      label: adaptation.limitations[0] ?? "context-bound adaptation",
      confidence: adaptation.confidence,
      reasonIds: [],
    }],
    linkedSystemRefs: [adaptation.id, adaptation.sourceRoutineId],
    behaviorHook: "future_adaptive_practice_confidence_filter",
  });
}

function draftFromVariant(variant: AdaptivePracticeVariant): KnowledgeCarrierDraft {
  const state: KnowledgeAvailabilityState = variant.status === "failed_variant"
    ? "distorted"
    : variant.status === "untested_variant"
      ? variant.variantCause === "partial_inheritance" ? "inherited_fragment" : "locally_untested"
      : variant.status === "local_only_variant"
        ? "active_practiced"
        : "fresh_observed";

  return makeDraft({
    sourceKey: variant.id,
    domain: "local_routine_adaptive_practice",
    label: variant.publicLabel,
    publicTitle: variant.publicLabel,
    humanMeaning: variant.status === "untested_variant"
      ? "The variant is remembered as a possible change, not proof."
      : "The variant carries bounded feedback about where a practice does or does not fit.",
    state,
    carrierClasses: uniqueCarriers([
      variant.variantCause === "copied_source" ? "social_trace" : "adaptive_response_memory",
      variant.variantCause === "partial_inheritance" ? "parent_inheritance" : "technical_only_projection",
    ]),
    strength: variant.status === "promising_variant" ? 0.56 : 0.38,
    availability: variant.status === "untested_variant" ? 0.24 : 0.42,
    decayPressure: 0.32,
    distortionRisk: variant.variantCause === "misread_trace" || variant.status === "failed_variant"
      ? "The variant is already tied to a misread, failed, or incomplete source."
      : undefined,
    localOnly: variant.status === "local_only_variant",
    sourceBasis: variant.variantCause === "partial_inheritance" ? "inherited" : variant.variantCause === "copied_source" ? "copied" : "mixed",
    daughterLocalTestingNeeded: variant.variantCause === "partial_inheritance",
    inheritanceConfidenceLoss: variant.variantCause === "partial_inheritance" ? 0.34 : 0,
    locationPrecision: "none",
    inheritedRouteUntested: false,
    inheritedWarningWithoutExactRoute: false,
    inheritedRoutineWithoutPractice: variant.variantCause === "partial_inheritance",
    localMismatchRisk: 0.44,
    evidenceRefs: [{
      sourceSystem: "adaptive_human",
      sourceId: variant.id,
      label: variant.variantCause.replace(/_/g, " "),
      confidence: variant.status === "promising_variant" ? 0.56 : 0.38,
      reasonIds: [],
    }],
    linkedSystemRefs: [variant.id, ...variant.evidenceRefs],
    behaviorHook: "future_adaptive_practice_confidence_filter",
  });
}

function reportedKnowledgeLossDrafts(band: Band): readonly KnowledgeCarrierDraft[] {
  const state = band.reportedKnowledge;
  if (state === undefined || (state.expiredOrFadedCount ?? 0) <= 0) {
    return [];
  }

  return [makeDraft({
    sourceKey: `reports-lost:${String(band.id)}`,
    domain: "social_contact_diffusion",
    label: "stale reports",
    publicTitle: "Some heard reports are no longer usable",
    humanMeaning: "The old social trace remains as a weak memory, but it is not available as reliable local knowledge.",
    state: "lost_or_unavailable",
    carrierClasses: ["social_trace", "technical_only_projection"],
    strength: 0.24,
    availability: 0.12,
    decayPressure: 0.76,
    dormancyReason: "Report lifecycle marked some reports as expired or faded.",
    distortionRisk: "Old reports can carry wrong confidence or a blurred region.",
    localOnly: false,
    sourceBasis: "copied",
    daughterLocalTestingNeeded: false,
    inheritanceConfidenceLoss: 0,
    locationPrecision: "region_fuzzy",
    inheritedRouteUntested: false,
    inheritedWarningWithoutExactRoute: false,
    inheritedRoutineWithoutPractice: false,
    localMismatchRisk: 0.48,
    evidenceRefs: [{
      sourceSystem: "reported_knowledge",
      sourceId: `reported-knowledge:${String(band.id)}`,
      label: `${state.expiredOrFadedCount ?? 0} expired or faded reports`,
      confidence: 0.24,
      stateHint: "expired_or_faded",
      reasonIds: [],
    }],
    linkedSystemRefs: [`reported-knowledge:${String(band.id)}`],
    behaviorHook: "future_social_diffusion_filter",
  })];
}

function makeDraft(input: KnowledgeCarrierDraft): KnowledgeCarrierDraft {
  return {
    ...input,
    strength: round2(clamp01(input.strength)),
    availability: round2(clamp01(input.availability)),
    decayPressure: round2(clamp01(input.decayPressure)),
    inheritanceConfidenceLoss: round2(clamp01(input.inheritanceConfidenceLoss)),
    localMismatchRisk: round2(clamp01(input.localMismatchRisk)),
    carrierClasses: uniqueCarriers(input.carrierClasses).slice(0, CARRIERS_PER_ITEM_CAP),
    evidenceRefs: capEvidence(input.evidenceRefs),
    linkedSystemRefs: uniqueStrings(input.linkedSystemRefs).slice(0, LINKED_SYSTEM_PER_ITEM_CAP),
  };
}

function selectKnowledgeCarrierDrafts(
  drafts: readonly KnowledgeCarrierDraft[],
  cap: number,
): readonly KnowledgeCarrierDraft[] {
  return drafts
    .slice()
    .sort(compareDrafts)
    .slice(0, cap);
}

function capAndFinalizeDrafts(band: Band, drafts: readonly KnowledgeCarrierDraft[]): readonly KnowledgeCarrierItem[] {
  const perDomain = countBy(KNOWLEDGE_CARRIER_DOMAINS, []);
  const seen = new Set<string>();
  const items: KnowledgeCarrierItem[] = [];

  for (const draft of drafts
    .filter((entry) => entry.evidenceRefs.length > 0)
    .sort(compareDrafts)) {
    const key = `${draft.domain}:${draft.state}:${draft.sourceKey}`;
    if (seen.has(key) || perDomain[draft.domain] >= ITEMS_PER_DOMAIN_CAP) {
      continue;
    }
    seen.add(key);
    perDomain[draft.domain] += 1;
    items.push(finalizeItem(band, draft));
    if (items.length >= PROFILE_ITEM_CAP) {
      break;
    }
  }

  return items.sort(compareItems);
}

function finalizeItem(band: Band, draft: KnowledgeCarrierDraft): KnowledgeCarrierItem {
  const sourceBasis = draft.sourceBasis;
  return {
    id: `knowledge-carrier:${String(band.id)}:${draft.domain}:${draft.state}:${slug(draft.sourceKey)}:${hashToken(draft.sourceKey)}`,
    domain: draft.domain,
    label: draft.label,
    publicTitle: draft.publicTitle,
    humanMeaning: draft.humanMeaning,
    state: draft.state,
    carrierClasses: draft.carrierClasses,
    strength: draft.strength,
    availability: draft.availability,
    decayPressure: draft.decayPressure,
    dormancyReason: draft.dormancyReason,
    distortionRisk: draft.distortionRisk,
    localOnly: draft.localOnly,
    sourceBasis,
    lived: sourceBasis === "lived" || sourceBasis === "mixed",
    inherited: sourceBasis === "inherited",
    copied: sourceBasis === "copied",
    parentSourceBandId: draft.parentSourceBandId,
    daughterLocalTestingNeeded: draft.daughterLocalTestingNeeded,
    inheritanceConfidenceLoss: draft.inheritanceConfidenceLoss,
    locationPrecision: draft.locationPrecision,
    inheritedRouteUntested: draft.inheritedRouteUntested,
    inheritedWarningWithoutExactRoute: draft.inheritedWarningWithoutExactRoute,
    inheritedRoutineWithoutPractice: draft.inheritedRoutineWithoutPractice,
    localMismatchRisk: draft.localMismatchRisk,
    lastUsedTick: draft.lastUsedTick,
    lastTestedTick: draft.lastTestedTick,
    lastUsedYear: draft.lastUsedYear,
    evidenceRefs: draft.evidenceRefs,
    linkedSystemRefs: draft.linkedSystemRefs,
    behaviorHook: {
      hook: draft.behaviorHook,
      status: "projection_only",
      maxInfluence: 0,
      capProof: "no_decision_path_reads_knowledge_carriers",
    },
    boundedness: {
      noSkillUnlocked: true,
      noTechTree: true,
      noCultureSystem: true,
      noDecisionInfluence: true,
      projectionOnly: true,
    },
  };
}

function makePublicCards(items: readonly KnowledgeCarrierItem[]): readonly KnowledgeCarrierPublicCard[] {
  return items
    .filter((item) =>
      item.state === "dormant" ||
      item.state === "fading" ||
      item.state === "distorted" ||
      item.state === "inherited_fragment" ||
      item.state === "copied_untested" ||
      item.state === "locally_untested" ||
      item.state === "lost_or_unavailable" ||
      item.availability >= 0.62)
    .sort((left, right) =>
      statePublicPriority(right.state) - statePublicPriority(left.state) ||
      right.decayPressure - left.decayPressure ||
      right.availability - left.availability ||
      left.id.localeCompare(right.id))
    .slice(0, PUBLIC_CARD_CAP)
    .map((item) => ({
      id: `knowledge-carrier-card:${item.id}`,
      title: item.publicTitle,
      domain: item.domain,
      state: item.state,
      oneLineMeaning: item.humanMeaning,
      carrierChips: item.carrierClasses.slice(0, 3),
      availabilityLabel: availabilityLabel(item.availability),
      evidenceChips: item.evidenceRefs.map((entry) => entry.label).slice(0, 3),
      technicalItemId: item.id,
    }));
}

function classifyKnowledgeEcologyState(
  item: KnowledgeEcologyItem,
  ageYears: number,
): KnowledgeAvailabilityState {
  if (item.livedStatus === "inherited_not_personally_lived" || item.practicalStatus === "inherited_not_practiced") {
    return "inherited_fragment";
  }
  if (item.fading && ageYears >= 20) {
    return "dormant";
  }
  if (item.fading || ageYears >= 14) {
    return "fading";
  }
  if (item.practicalStatus === "heard_about" || item.practicalStatus === "story_only") {
    return "locally_untested";
  }
  if (item.transmission === "personally_practiced" && item.confidence >= 0.52) {
    return "active_practiced";
  }
  if (item.evidence.some((entry) => entry.kind === "activity_trip" || entry.kind === "activity_summary")) {
    return "recently_tested";
  }
  return "fresh_observed";
}

function stateFromSocialDiffusion(item: SocialDiffusionItem): KnowledgeAvailabilityState {
  if (item.status === "inherited_story" || item.status === "inherited_practical_hint") {
    return "inherited_fragment";
  }
  if (item.status === "copied_superficially" || item.status === "partial_copy" || item.status === "heard_not_practiced") {
    return "copied_untested";
  }
  if (item.status === "blocked_by_material_context" || item.status === "blocked_by_labor" || item.status === "rejected_as_untrusted") {
    return "blocked_by_context";
  }
  if (item.risks.includes("distorted_or_stale") || item.status === "false_confidence_risk" || item.status === "dead_end_risk") {
    return "distorted";
  }
  if (item.status === "tested_locally") {
    return "recently_tested";
  }
  if (item.status === "local_only") {
    return "active_practiced";
  }
  if (item.status === "visible_trace_only" || item.status === "seen_not_understood" || item.status === "compatible_but_untried") {
    return "locally_untested";
  }
  return "fresh_observed";
}

function carriersForKnowledgeItem(band: Band, item: KnowledgeEcologyItem): readonly KnowledgeCarrierClass[] {
  const carriers: KnowledgeCarrierClass[] = [];
  switch (item.domain) {
    case "route_corridor":
      carriers.push("repeated_route_use");
      break;
    case "crossing":
      carriers.push("repeated_crossing_use");
      break;
    case "place_country":
      carriers.push("camp_place_memory", "seasonal_round");
      break;
    case "food_work":
      carriers.push("activity_party_memory");
      break;
    case "water_refuge":
      carriers.push("camp_place_memory", "activity_party_memory");
      break;
    case "risk_caution":
      carriers.push("event_memory", "failed_attempt_memory");
      break;
    case "social_contact":
      carriers.push("social_trace");
      break;
    case "inherited_memory":
      carriers.push("parent_inheritance", "daughter_founding_fragment");
      break;
  }
  if (item.transmission === "personally_practiced") {
    carriers.push("recent_practice");
  }
  if (item.memoryScope === "durable" || item.fading) {
    carriers.push(...addAggregateMemoryCarrier(band, []));
  }
  return uniqueCarriers(carriers.length === 0 ? ["technical_only_projection"] : carriers);
}

function addAggregateMemoryCarrier(
  band: Band,
  carriers: readonly KnowledgeCarrierClass[],
): readonly KnowledgeCarrierClass[] {
  return uniqueCarriers([
    ...carriers,
    band.demography.elders > 0 || band.demography.workingAdults > 0
      ? "aggregate_elder_adult_memory"
      : "technical_only_projection",
  ]);
}

function mapKnowledgeDomain(domain: KnowledgeEcologyDomain): KnowledgeCarrierDomain {
  switch (domain) {
    case "route_corridor":
      return "route_corridor";
    case "crossing":
      return "crossing_ford";
    case "place_country":
      return "place_camp_country";
    case "food_work":
      return "food_work";
    case "water_refuge":
      return "water_refuge";
    case "risk_caution":
      return "risk_caution";
    case "social_contact":
      return "social_contact_diffusion";
    case "inherited_memory":
      return "deep_history_inherited";
  }
}

function mapSocialDomain(domain: SocialDiffusionDomain): KnowledgeCarrierDomain {
  switch (domain) {
    case "route_crossing":
      return "route_corridor";
    case "food_work":
      return "food_work";
    case "camp_foothold_care":
    case "fire_hearth_fuel":
      return "camp_care";
    case "material_affordance":
      return "material_practice";
    case "water_edge":
      return "water_refuge";
    case "social_contact":
      return "social_contact_diffusion";
  }
}

function eventDomain(family: string): KnowledgeCarrierDomain {
  if (/route|crossing/i.test(family)) {
    return "route_corridor";
  }
  if (/food|water/i.test(family)) {
    return "food_work";
  }
  if (/movement|place/i.test(family)) {
    return "place_camp_country";
  }
  return "risk_caution";
}

function socialMeaning(item: SocialDiffusionItem, state: KnowledgeAvailabilityState): string {
  if (state === "copied_untested") {
    return "The copied clue has reached them, but it has not been practiced here.";
  }
  if (state === "inherited_fragment") {
    return "The daughter band carried the hint, but not the full local confidence.";
  }
  if (state === "distorted") {
    return "The clue may be stale, partial, or missing local context.";
  }
  if (state === "blocked_by_context") {
    return "The clue exists, but material, labor, or trust blocks it here.";
  }
  return item.meaning;
}

function meaningForState(state: KnowledgeAvailabilityState, fallback: string): string {
  switch (state) {
    case "dormant":
      return "They still remember it, but not well enough to trust it automatically.";
    case "fading":
      return "The memory is present, but recent use has not kept it strong.";
    case "inherited_fragment":
      return "The daughter band carried the warning or hint, but not the full confidence.";
    case "copied_untested":
      return "The copied practice survives as a hint, not a reliable local routine.";
    case "locally_untested":
      return "It has not been tested in this place yet.";
    case "distorted":
      return "The memory is bounded by stale or mismatched evidence.";
    case "lost_or_unavailable":
      return "The old knowledge is still referenced, but not available enough to act on.";
    case "active_practiced":
    case "fresh_observed":
    case "recently_tested":
    case "blocked_by_context":
      return fallback;
  }
}

function distortionRiskForKnowledgeItem(
  item: KnowledgeEcologyItem,
  state: KnowledgeAvailabilityState,
): string | undefined {
  if (state === "distorted") {
    return "Conflicting or stale evidence can blur the confidence.";
  }
  if (item.livedStatus === "inherited_not_personally_lived") {
    return "Inherited memory can preserve a region or warning without exact route confidence.";
  }
  if (item.practicalStatus === "heard_about") {
    return "Heard knowledge may be overgeneralized until tested locally.";
  }
  if (item.fading) {
    return "Fading memory can keep the place but lose season or confidence.";
  }
  return undefined;
}

function localMismatchForSocial(item: SocialDiffusionItem): NormalizedIntensity {
  let risk = 0.18;
  if (item.compatibility === "mismatched_material" || item.compatibility === "mismatched_place") {
    risk += 0.28;
  }
  if (item.compatibility === "inherited_from_different_country") {
    risk += 0.34;
  }
  if (item.risks.includes("missing_tacit_steps")) {
    risk += 0.18;
  }
  if (item.risks.includes("local_only")) {
    risk += 0.18;
  }
  return round2(clamp01(risk));
}

function resourceEffectiveConfidence(
  effective: ReturnType<typeof effectiveResourceConfidence>,
): NormalizedIntensity {
  return round2(Math.max(
    effective.effectivePresenceConfidence,
    effective.effectiveSeasonConfidence,
    effective.effectiveYieldConfidence,
    effective.effectiveSafetyConfidence,
    effective.effectiveProcessingConfidence,
    effective.effectiveAccessConfidence,
    effective.effectiveRecoveryConfidence,
  ));
}

function availabilityFor(
  state: KnowledgeAvailabilityState,
  strength: number,
  decayPressure: number,
): NormalizedIntensity {
  const base = clamp01(strength);
  switch (state) {
    case "active_practiced":
      return round2(Math.max(0.56, base * (1 - decayPressure * 0.18)));
    case "recently_tested":
      return round2(base * (1 - decayPressure * 0.24));
    case "fresh_observed":
      return round2(base * 0.82);
    case "fading":
      return round2(base * 0.55);
    case "dormant":
      return round2(Math.min(0.34, base * 0.38));
    case "distorted":
      return round2(base * 0.42);
    case "inherited_fragment":
      return round2(base * 0.48);
    case "copied_untested":
      return round2(base * 0.36);
    case "locally_untested":
      return round2(base * 0.44);
    case "blocked_by_context":
      return round2(base * 0.25);
    case "lost_or_unavailable":
      return round2(Math.min(0.18, base * 0.25));
  }
}

function decayFromYears(ageYears: number): NormalizedIntensity {
  if (ageYears <= 2) {
    return 0.06;
  }
  if (ageYears <= 8) {
    return round2(0.12 + ageYears * 0.025);
  }
  return round2(Math.min(0.82, 0.26 + (ageYears - 8) * 0.035));
}

function overviewTitle(items: readonly KnowledgeCarrierItem[]): string {
  if (items.some((item) => item.state === "dormant" || item.state === "fading")) {
    return "Some knowledge is alive and some is fading";
  }
  if (items.some((item) => item.state === "inherited_fragment")) {
    return "Parent memory is carried as fragments";
  }
  if (items.some((item) => item.state === "copied_untested")) {
    return "Copied hints still need local proof";
  }
  return items.length === 0 ? "No carrier profile is visible yet" : "Knowledge has visible carriers";
}

function overviewLines(items: readonly KnowledgeCarrierItem[]): readonly string[] {
  if (items.length === 0) {
    return ["No grounded knowledge carrier profile is visible for this band yet."];
  }
  const active = items.filter((item) => item.state === "active_practiced" || item.state === "recently_tested").length;
  const weak = items.filter((item) =>
    item.state === "fading" ||
    item.state === "dormant" ||
    item.state === "distorted" ||
    item.state === "lost_or_unavailable").length;
  const inherited = items.filter((item) => item.inherited).length;
  const copied = items.filter((item) => item.copied || item.state === "copied_untested").length;
  return [
    active > 0
      ? `${countWord(active)} item${active === 1 ? "" : "s"} are still backed by recent practice or testing.`
      : "Most visible knowledge is not currently backed by recent practice.",
    weak > 0
      ? `${countWord(weak)} item${weak === 1 ? "" : "s"} are fading, dormant, distorted, or unavailable rather than deleted.`
      : "No visible item is marked dormant or distorted in this profile.",
    inherited > 0
      ? "Inherited fragments are separated from lived local knowledge."
      : copied > 0
        ? "Copied hints are separated from practiced routines."
        : "Local routines remain local rather than becoming general skills.",
  ];
}

export function knowledgeCarrierDomainLabel(domain: KnowledgeCarrierDomain): string {
  switch (domain) {
    case "route_corridor": return "Routes";
    case "crossing_ford": return "Crossings";
    case "place_camp_country": return "Places";
    case "food_work": return "Food work";
    case "water_refuge": return "Water/refuge";
    case "risk_caution": return "Caution";
    case "material_practice": return "Material practice";
    case "camp_care": return "Camp care";
    case "social_contact_diffusion": return "Between bands";
    case "range_rotation_pressure_relief": return "Range relief";
    case "deep_history_inherited": return "Inherited memory";
    case "local_routine_adaptive_practice": return "Local routines";
  }
}

export function knowledgeAvailabilityLabel(state: KnowledgeAvailabilityState): string {
  return state.replace(/_/g, " ");
}

export function knowledgeCarrierClassLabel(carrier: KnowledgeCarrierClass): string {
  switch (carrier) {
    case "recent_practice": return "recent practice";
    case "repeated_route_use": return "repeated route use";
    case "repeated_crossing_use": return "repeated crossing";
    case "camp_place_memory": return "camp place memory";
    case "seasonal_round": return "seasonal round";
    case "local_routine": return "local routine";
    case "event_memory": return "event memory";
    case "failed_attempt_memory": return "failed attempt";
    case "successful_attempt_memory": return "successful attempt";
    case "adaptive_response_memory": return "adaptive response";
    case "parent_inheritance": return "parent memory";
    case "daughter_founding_fragment": return "daughter founding";
    case "social_trace": return "social trace";
    case "visible_trace": return "visible trace";
    case "activity_party_memory": return "activity party";
    case "aggregate_elder_adult_memory": return "older/adult memory";
    case "technical_only_projection": return "technical projection";
  }
}

export function availabilityLabel(value: number): string {
  if (value >= 0.68) return "still trusted";
  if (value >= 0.48) return "usable with caution";
  if (value >= 0.28) return "weak";
  return "not actionable";
}

function capEvidence(evidence: readonly KnowledgeCarrierEvidenceRef[]): readonly KnowledgeCarrierEvidenceRef[] {
  const seen = new Set<string>();
  const result: KnowledgeCarrierEvidenceRef[] = [];
  for (const entry of evidence
    .filter((item) => item.label.length > 0)
    .sort((left, right) =>
      right.confidence - left.confidence ||
      left.sourceSystem.localeCompare(right.sourceSystem) ||
      left.sourceId.localeCompare(right.sourceId))) {
    const key = `${entry.sourceSystem}:${entry.sourceId}:${entry.label}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push({
      ...entry,
      confidence: round2(entry.confidence),
      reasonIds: entry.reasonIds.slice(0, EVIDENCE_PER_ITEM_CAP),
    });
    if (result.length >= EVIDENCE_PER_ITEM_CAP) {
      break;
    }
  }
  return result;
}

function firstEvidenceTile(evidence: readonly { readonly tileId?: TileId }[]): TileId | undefined {
  return evidence.find((entry) => entry.tileId !== undefined)?.tileId;
}

function uniqueCarriers(carriers: readonly KnowledgeCarrierClass[]): readonly KnowledgeCarrierClass[] {
  return uniqueStrings(carriers).filter((carrier): carrier is KnowledgeCarrierClass =>
    KNOWLEDGE_CARRIER_CLASSES.includes(carrier as KnowledgeCarrierClass));
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (value.length === 0 || seen.has(value)) {
      continue;
    }
    seen.add(value);
    result.push(value);
  }
  return result;
}

function countBy<T extends string>(keys: readonly T[], values: readonly T[]): Record<T, number> {
  const counts = Object.fromEntries(keys.map((key) => [key, 0])) as Record<T, number>;
  for (const value of values) {
    counts[value] += 1;
  }
  return counts;
}

function compareDrafts(left: KnowledgeCarrierDraft, right: KnowledgeCarrierDraft): number {
  return selectionStatePriority(right.state) - selectionStatePriority(left.state) ||
    right.availability - left.availability ||
    right.strength - left.strength ||
    left.domain.localeCompare(right.domain) ||
    left.sourceKey.localeCompare(right.sourceKey);
}

function compareItems(left: KnowledgeCarrierItem, right: KnowledgeCarrierItem): number {
  return selectionStatePriority(right.state) - selectionStatePriority(left.state) ||
    right.availability - left.availability ||
    left.id.localeCompare(right.id);
}

function selectionStatePriority(state: KnowledgeAvailabilityState): number {
  switch (state) {
    case "active_practiced": return 11;
    case "inherited_fragment": return 10;
    case "copied_untested": return 9;
    case "locally_untested": return 8;
    case "fading": return 7;
    case "dormant": return 6;
    case "distorted": return 6;
    case "lost_or_unavailable": return 5;
    case "blocked_by_context": return 4;
    case "recently_tested": return 3;
    case "fresh_observed": return 2;
  }
}

function statePublicPriority(state: KnowledgeAvailabilityState): number {
  switch (state) {
    case "dormant": return 11;
    case "fading": return 10;
    case "distorted": return 9;
    case "inherited_fragment": return 8;
    case "copied_untested": return 7;
    case "locally_untested": return 6;
    case "lost_or_unavailable": return 5;
    case "active_practiced": return 4;
    case "recently_tested": return 3;
    case "fresh_observed": return 2;
    case "blocked_by_context": return 1;
  }
}

function countWord(value: number): string {
  const words = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
  return words[value] ?? String(value);
}

function slug(value: string): string {
  const slugged = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return slugged.length === 0 ? "item" : slugged.slice(0, 64);
}

function hashToken(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  }
  return (hash >>> 0).toString(36);
}

function round2(value: number): NormalizedIntensity {
  return Math.round(clamp01(value) * 100) / 100;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

function byteLengthUtf8(value: string): number {
  return new TextEncoder().encode(value).length;
}
