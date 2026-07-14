import type { BandId, ReasonId, TileId } from "../core/types";
import type { NormalizedIntensity } from "../rules/types";
import type { WorldState } from "../world/types";
import { deriveBandIdentityProfile } from "./bandIdentity";
import { deriveCampFootholdProfile, type CampFootholdFactor } from "./campFoothold";
import { deriveCanonicalEvents } from "./eventSystem";
import { deriveKnowledgeEcologyProfile, type KnowledgeEcologyItem } from "./knowledgeEcology";
import { deriveMaterialAffordanceProfile, type MaterialAffordanceItem } from "./materialAffordance";
import { derivePracticeFeedbackReadinessProfile, type PracticeFeedbackReadinessItem } from "./practiceFeedbackReadiness";
import { deriveProblemPracticeProfile } from "./problemPractice";
import { deriveSocialRangeRecognition, type RecognizedRangeContext } from "./socialRangeRecognition";
import type {
  Band,
  IntraSeasonTripRecord,
  KnownBandContactMemory,
  ReportedKnowledgeSpeculation,
  ReportedKnowledgeTopic,
  ReportTrustBasis,
  WordOfMouthReport,
} from "./types";

const SOCIAL_CONTEXT_CAP = 6;
const DIFFUSION_ITEM_CAP = 8;
const ITEMS_PER_DOMAIN_CAP = 2;
const EVIDENCE_PER_ITEM_CAP = 4;
const EVIDENCE_PER_CONTEXT_CAP = 3;
const LINK_PER_ITEM_CAP = 4;
const CONTEXT_RECORD_CAP = 16;
const SAMPLE_CAP = 12;

export type SocialEcologicalContextKind =
  | "direct_contact"
  | "activity_talk"
  | "visible_trace"
  | "old_camp_trace"
  | "parent_daughter_inheritance"
  | "shared_route_water_country";

export type SocialDiffusionChannel =
  | "direct_contact"
  | "activity_talk"
  | "visible_trace"
  | "old_camp_trace"
  | "parent_daughter"
  | "shared_route_water_country";

export type SocialDiffusionDomain =
  | "route_crossing"
  | "food_work"
  | "camp_foothold_care"
  | "material_affordance"
  | "fire_hearth_fuel"
  | "water_edge"
  | "social_contact";

export type SocialDiffusionStatus =
  | "heard_not_practiced"
  | "seen_not_understood"
  | "visible_trace_only"
  | "copied_superficially"
  | "partial_copy"
  | "rejected_as_untrusted"
  | "withheld_or_not_shared"
  | "inherited_story"
  | "inherited_practical_hint"
  | "tested_locally"
  | "blocked_by_material_context"
  | "blocked_by_labor"
  | "local_only"
  | "false_confidence_risk"
  | "dead_end_risk"
  | "compatible_but_untried"
  | "diffusion_ready_later";

export type SocialDiffusionTacitDifficulty = "low" | "medium" | "high" | "unknown";

export type SocialDiffusionCompatibility =
  | "compatible"
  | "weakly_compatible"
  | "mismatched_material"
  | "mismatched_place"
  | "not_enough_labor"
  | "inherited_from_different_country"
  | "unknown_compatibility";

export type SocialDiffusionTrustFilter =
  | "trusted_enough_to_hear"
  | "cautious_hearsay"
  | "avoids_source"
  | "source_unknown"
  | "inherited_caution"
  | "friendly_contact"
  | "tense_contact"
  | "no_social_basis";

export type SocialDiffusionRisk =
  | "missing_tacit_steps"
  | "distorted_or_stale"
  | "untrusted_source"
  | "withholding_possible"
  | "material_mismatch"
  | "place_mismatch"
  | "labor_blocked"
  | "local_only"
  | "false_confidence"
  | "dead_end";

export type SocialDiffusionBasis = "lived_local" | "inherited" | "heard" | "visible_trace" | "mixed" | "unknown";

export type SocialDiffusionSourceSystem =
  | "contact_memory"
  | "reported_knowledge"
  | "social_range_recognition"
  | "familiar_country"
  | "activity_party"
  | "camp_foothold"
  | "practice_feedback"
  | "problem_practice"
  | "material_affordance"
  | "knowledge_ecology"
  | "canonical_event"
  | "route_memory"
  | "crossing_memory"
  | "place_memory"
  | "fission_inheritance"
  | "band_identity";

export type SocialDiffusionEvidenceKind =
  | "contact"
  | "report"
  | "speculation"
  | "range_context"
  | "activity"
  | "visible_trace"
  | "inheritance"
  | "practice_feedback"
  | "affordance"
  | "knowledge"
  | "event"
  | "foothold"
  | "memory"
  | "identity";

export interface SocialDiffusionEvidenceRef {
  readonly kind: SocialDiffusionEvidenceKind;
  readonly sourceSystem: SocialDiffusionSourceSystem;
  readonly label: string;
  readonly sourceId: string;
  readonly confidence: NormalizedIntensity;
  readonly basis: SocialDiffusionBasis;
  readonly sourceBandId?: BandId;
  readonly relatedBandId?: BandId;
  readonly knowledgeId?: string;
  readonly reportId?: string;
  readonly eventId?: string;
  readonly activityId?: string;
  readonly affordanceId?: string;
  readonly practiceFeedbackId?: string;
  readonly footholdId?: string;
  readonly tileId?: TileId;
  readonly reasonIds: readonly ReasonId[];
}

export interface SocialEcologicalContext {
  readonly id: string;
  readonly kind: SocialEcologicalContextKind;
  readonly channel: SocialDiffusionChannel;
  readonly publicLabel: string;
  readonly meaning: string;
  readonly sourceBandId?: BandId;
  readonly relatedBandIds: readonly BandId[];
  readonly relation: string;
  readonly trustFilter: SocialDiffusionTrustFilter;
  readonly contactBasis: "direct" | "indirect" | "trace" | "inherited" | "shared_country" | "unknown";
  readonly confidence: NormalizedIntensity;
  readonly recencyLine: string;
  readonly sharedContextLine: string;
  readonly evidence: readonly SocialDiffusionEvidenceRef[];
  readonly noDecisionInfluence: true;
  readonly noTerritoryClaim: true;
}

export interface SocialDiffusionItem {
  readonly id: string;
  readonly domain: SocialDiffusionDomain;
  readonly channel: SocialDiffusionChannel;
  readonly publicLabel: string;
  readonly meaning: string;
  readonly sourceBandId?: BandId;
  readonly sourceLabel: string;
  readonly linkedContextIds: readonly string[];
  readonly linkedKnowledgeIds: readonly string[];
  readonly linkedReportIds: readonly string[];
  readonly linkedEventIds: readonly string[];
  readonly linkedActivityIds: readonly string[];
  readonly linkedAffordanceIds: readonly string[];
  readonly linkedPracticeFeedbackIds: readonly string[];
  readonly linkedFootholdIds: readonly string[];
  readonly visibility: "heard" | "seen" | "trace" | "inherited" | "shared_country" | "uncertain";
  readonly transferDifficulty: SocialDiffusionTacitDifficulty;
  readonly tacitDifficulty: SocialDiffusionTacitDifficulty;
  readonly compatibility: SocialDiffusionCompatibility;
  readonly trustFilter: SocialDiffusionTrustFilter;
  readonly status: SocialDiffusionStatus;
  readonly risks: readonly SocialDiffusionRisk[];
  readonly inheritedVsLocalBasis: SocialDiffusionBasis;
  readonly confidence: NormalizedIntensity;
  readonly evidence: readonly SocialDiffusionEvidenceRef[];
  readonly sourceSystems: readonly SocialDiffusionSourceSystem[];
  readonly noSkillUnlocked: true;
  readonly noAutomaticImprovement: true;
  readonly noDecisionInfluence: true;
  readonly diffusionReadyLaterIsNotKnowledge: true;
  readonly futureHook: "interband_social_learning_candidate";
}

export interface SocialEcologicalDiffusionProfile {
  readonly bandId: BandId;
  readonly generatedAtTick: number;
  readonly generatedAtYear: number;
  readonly projectionMode: "selected_band_projection";
  readonly overviewTitle: string;
  readonly overviewLines: readonly string[];
  readonly socialContexts: readonly SocialEcologicalContext[];
  readonly diffusionItems: readonly SocialDiffusionItem[];
  readonly contextKindCounts: Readonly<Record<SocialEcologicalContextKind, number>>;
  readonly channelCounts: Readonly<Record<SocialDiffusionChannel, number>>;
  readonly domainCounts: Readonly<Record<SocialDiffusionDomain, number>>;
  readonly statusCounts: Readonly<Record<SocialDiffusionStatus, number>>;
  readonly tacitDifficultyCounts: Readonly<Record<SocialDiffusionTacitDifficulty, number>>;
  readonly compatibilityCounts: Readonly<Record<SocialDiffusionCompatibility, number>>;
  readonly trustFilterCounts: Readonly<Record<SocialDiffusionTrustFilter, number>>;
  readonly basisCounts: Readonly<Record<SocialDiffusionBasis, number>>;
  readonly sourceSystemCounts: Readonly<Record<SocialDiffusionSourceSystem, number>>;
  readonly directContactRefCount: number;
  readonly activityTalkRefCount: number;
  readonly visibleTraceRefCount: number;
  readonly parentDaughterRefCount: number;
  readonly sharedRouteWaterRefCount: number;
  readonly knowledgeRefCount: number;
  readonly eventRefCount: number;
  readonly affordanceRefCount: number;
  readonly practiceFeedbackRefCount: number;
  readonly footholdRefCount: number;
  readonly inheritedBasisCount: number;
  readonly localTestedBasisCount: number;
  readonly failedImitationCount: number;
  readonly partialCopyCount: number;
  readonly seenNotUnderstoodCount: number;
  readonly withholdingCount: number;
  readonly rejectionCount: number;
  readonly constraints: readonly string[];
  readonly caps: {
    readonly socialContextCap: number;
    readonly diffusionItemCap: number;
    readonly itemsPerDomainCap: number;
    readonly evidencePerItemCap: number;
    readonly evidencePerContextCap: number;
    readonly linkPerItemCap: number;
    readonly contextRecordCap: number;
    readonly capsHeld: boolean;
  };
  readonly integrity: {
    readonly selectedBandOnly: true;
    readonly projectionOnly: true;
    readonly noBehaviorInfluence: true;
    readonly noDecisionInfluence: true;
    readonly noSkillOrAdaptationState: true;
    readonly noAutomaticImprovement: true;
    readonly noCultureTabooMythWorldviewReligionLanguage: true;
    readonly noDiplomacyAllianceTradeWarTerritoryProperty: true;
    readonly noSocialNetworkKinshipMarriageSystem: true;
    readonly noSettlementAgricultureDomesticationInventory: true;
    readonly antiOmniscient: true;
    readonly noHiddenOtherBandInternalState: true;
    readonly inheritedSeparated: boolean;
    readonly daughterParentKnowledgeNotLocalTesting: boolean;
    readonly tacitKnowledgeRepresented: boolean;
    readonly compatibilityRepresented: boolean;
    readonly trustCautionRepresented: boolean;
    readonly failedImitationRepresented: boolean;
  };
  readonly chronicleIntegration: {
    readonly mode: "inspected_skipped";
    readonly reason: string;
    readonly brokenRenderedLinks: 0;
  };
  readonly technicalProof: {
    readonly payloadBytesEstimate: number;
    readonly maxContextPayloadBytes: number;
    readonly maxItemPayloadBytes: number;
    readonly sourceIdSamples: readonly string[];
    readonly contextIdSamples: readonly string[];
    readonly reportIdSamples: readonly string[];
    readonly knowledgeIdSamples: readonly string[];
    readonly eventIdSamples: readonly string[];
    readonly activityIdSamples: readonly string[];
    readonly affordanceIdSamples: readonly string[];
    readonly practiceFeedbackIdSamples: readonly string[];
    readonly footholdIdSamples: readonly string[];
    readonly brokenRenderedLinks: 0;
    readonly fakeDiplomacyTradeTerritoryCultureClaimCount: 0;
    readonly fakeSkillAdaptationClaimCount: 0;
    readonly hiddenInternalStateExposureCount: 0;
    readonly decisionPathIsolation: true;
  };
}

interface SocialDiffusionContext {
  readonly world: WorldState;
  readonly band: Band;
  readonly contactMemories: readonly KnownBandContactMemory[];
  readonly reports: readonly WordOfMouthReport[];
  readonly speculations: readonly ReportedKnowledgeSpeculation[];
  readonly rangeContexts: readonly RecognizedRangeContext[];
  readonly trips: readonly IntraSeasonTripRecord[];
  readonly knowledgeItems: readonly KnowledgeEcologyItem[];
  readonly affordances: readonly MaterialAffordanceItem[];
  readonly practiceItems: readonly PracticeFeedbackReadinessItem[];
  readonly footholdFactors: readonly CampFootholdFactor[];
}

const CONTEXT_KINDS: readonly SocialEcologicalContextKind[] = [
  "direct_contact",
  "activity_talk",
  "visible_trace",
  "old_camp_trace",
  "parent_daughter_inheritance",
  "shared_route_water_country",
];

const CHANNELS: readonly SocialDiffusionChannel[] = [
  "direct_contact",
  "activity_talk",
  "visible_trace",
  "old_camp_trace",
  "parent_daughter",
  "shared_route_water_country",
];

const DOMAINS: readonly SocialDiffusionDomain[] = [
  "route_crossing",
  "food_work",
  "camp_foothold_care",
  "material_affordance",
  "fire_hearth_fuel",
  "water_edge",
  "social_contact",
];

const STATUSES: readonly SocialDiffusionStatus[] = [
  "heard_not_practiced",
  "seen_not_understood",
  "visible_trace_only",
  "copied_superficially",
  "partial_copy",
  "rejected_as_untrusted",
  "withheld_or_not_shared",
  "inherited_story",
  "inherited_practical_hint",
  "tested_locally",
  "blocked_by_material_context",
  "blocked_by_labor",
  "local_only",
  "false_confidence_risk",
  "dead_end_risk",
  "compatible_but_untried",
  "diffusion_ready_later",
];

const TACIT_DIFFICULTIES: readonly SocialDiffusionTacitDifficulty[] = ["low", "medium", "high", "unknown"];

const COMPATIBILITIES: readonly SocialDiffusionCompatibility[] = [
  "compatible",
  "weakly_compatible",
  "mismatched_material",
  "mismatched_place",
  "not_enough_labor",
  "inherited_from_different_country",
  "unknown_compatibility",
];

const TRUST_FILTERS: readonly SocialDiffusionTrustFilter[] = [
  "trusted_enough_to_hear",
  "cautious_hearsay",
  "avoids_source",
  "source_unknown",
  "inherited_caution",
  "friendly_contact",
  "tense_contact",
  "no_social_basis",
];

const BASES: readonly SocialDiffusionBasis[] = ["lived_local", "inherited", "heard", "visible_trace", "mixed", "unknown"];

const SOURCE_SYSTEMS: readonly SocialDiffusionSourceSystem[] = [
  "contact_memory",
  "reported_knowledge",
  "social_range_recognition",
  "familiar_country",
  "activity_party",
  "camp_foothold",
  "practice_feedback",
  "problem_practice",
  "material_affordance",
  "knowledge_ecology",
  "canonical_event",
  "route_memory",
  "crossing_memory",
  "place_memory",
  "fission_inheritance",
  "band_identity",
];

export function deriveSocialEcologicalDiffusionProfile(world: WorldState, band: Band): SocialEcologicalDiffusionProfile {
  const knowledgeProfile = deriveKnowledgeEcologyProfile(world, band);
  const materialProfile = deriveMaterialAffordanceProfile(world, band);
  const problemProfile = deriveProblemPracticeProfile(world, band);
  const footholdProfile = deriveCampFootholdProfile(world, band);
  const practiceProfile = derivePracticeFeedbackReadinessProfile(world, band);
  const events = deriveCanonicalEvents(world, band);
  deriveBandIdentityProfile(world, band);
  const rangeRecognition = deriveSocialRangeRecognition(band, world, world.time.tick);

  const context: SocialDiffusionContext = {
    world,
    band,
    contactMemories: Object.values(band.contactMemories)
      .sort(compareContacts)
      .slice(0, CONTEXT_RECORD_CAP),
    reports: [...(band.reportedKnowledge?.reports ?? [])]
      .sort(compareReports)
      .slice(0, CONTEXT_RECORD_CAP),
    speculations: [...(band.reportedKnowledge?.speculations ?? [])]
      .sort(compareSpeculations)
      .slice(0, CONTEXT_RECORD_CAP),
    rangeContexts: rangeRecognition.neighbors.slice(0, CONTEXT_RECORD_CAP),
    trips: [...(band.recentIntraSeasonTrips ?? [])]
      .sort(compareTrips)
      .slice(0, CONTEXT_RECORD_CAP),
    knowledgeItems: knowledgeProfile.items.slice(0, CONTEXT_RECORD_CAP),
    affordances: materialProfile.items.slice(0, CONTEXT_RECORD_CAP),
    practiceItems: practiceProfile.items.slice(0, CONTEXT_RECORD_CAP),
    footholdFactors: footholdProfile.factors.slice(0, CONTEXT_RECORD_CAP),
  };

  const socialContexts = capSocialContexts([
    ...buildContactContexts(context),
    ...buildReportContexts(context),
    ...buildSharedRangeContexts(context),
    ...buildInheritanceContexts(context),
    ...buildTraceContexts(context),
  ]);
  const diffusionItems = capDiffusionItems([
    ...buildReportDiffusionItems(context, socialContexts),
    ...buildSharedRangeDiffusionItems(context, socialContexts),
    ...buildInheritanceDiffusionItems(context, socialContexts),
    ...buildPracticeTraceDiffusionItems(context, socialContexts),
    ...buildFootholdTraceDiffusionItems(context, socialContexts),
    ...buildSpeculationDiffusionItems(context, socialContexts),
    ...buildWithholdingDiffusionItems(context, socialContexts),
  ]);
  const allEvidence = [
    ...socialContexts.flatMap((item) => item.evidence),
    ...diffusionItems.flatMap((item) => item.evidence),
  ];
  const payloadDraft = {
    bandId: band.id,
    generatedAtTick: Number(world.time.tick),
    generatedAtYear: world.time.year,
    socialContexts,
    diffusionItems,
  };

  return {
    bandId: band.id,
    generatedAtTick: Number(world.time.tick),
    generatedAtYear: world.time.year,
    projectionMode: "selected_band_projection",
    overviewTitle: socialDiffusionTitle(socialContexts, diffusionItems),
    overviewLines: socialDiffusionLines(socialContexts, diffusionItems),
    socialContexts,
    diffusionItems,
    contextKindCounts: countByKey(CONTEXT_KINDS, socialContexts.map((item) => item.kind)),
    channelCounts: countByKey(CHANNELS, diffusionItems.map((item) => item.channel)),
    domainCounts: countByKey(DOMAINS, diffusionItems.map((item) => item.domain)),
    statusCounts: countByKey(STATUSES, diffusionItems.map((item) => item.status)),
    tacitDifficultyCounts: countByKey(TACIT_DIFFICULTIES, diffusionItems.map((item) => item.tacitDifficulty)),
    compatibilityCounts: countByKey(COMPATIBILITIES, diffusionItems.map((item) => item.compatibility)),
    trustFilterCounts: countByKey(TRUST_FILTERS, [
      ...socialContexts.map((item) => item.trustFilter),
      ...diffusionItems.map((item) => item.trustFilter),
    ]),
    basisCounts: countByKey(BASES, [
      ...allEvidence.map((entry) => entry.basis),
      ...diffusionItems.map((item) => item.inheritedVsLocalBasis),
    ]),
    sourceSystemCounts: countByKey(SOURCE_SYSTEMS, allEvidence.map((entry) => entry.sourceSystem)),
    directContactRefCount: allEvidence.filter((entry) => entry.sourceSystem === "contact_memory").length,
    activityTalkRefCount: allEvidence.filter((entry) => entry.sourceSystem === "reported_knowledge" || entry.sourceSystem === "activity_party").length,
    visibleTraceRefCount: allEvidence.filter((entry) => entry.basis === "visible_trace" || entry.kind === "visible_trace" || entry.kind === "foothold").length,
    parentDaughterRefCount: allEvidence.filter((entry) => entry.sourceSystem === "fission_inheritance" || entry.basis === "inherited").length,
    sharedRouteWaterRefCount: allEvidence.filter((entry) =>
      entry.sourceSystem === "social_range_recognition" ||
      entry.sourceSystem === "route_memory" ||
      entry.sourceSystem === "crossing_memory").length,
    knowledgeRefCount: uniqueCount(diffusionItems.flatMap((item) => item.linkedKnowledgeIds)),
    eventRefCount: uniqueCount(diffusionItems.flatMap((item) => item.linkedEventIds)),
    affordanceRefCount: uniqueCount(diffusionItems.flatMap((item) => item.linkedAffordanceIds)),
    practiceFeedbackRefCount: uniqueCount(diffusionItems.flatMap((item) => item.linkedPracticeFeedbackIds)),
    footholdRefCount: uniqueCount(diffusionItems.flatMap((item) => item.linkedFootholdIds)),
    inheritedBasisCount: allEvidence.filter((entry) => entry.basis === "inherited").length +
      diffusionItems.filter((item) => item.inheritedVsLocalBasis === "inherited").length,
    localTestedBasisCount: allEvidence.filter((entry) => entry.basis === "lived_local").length +
      diffusionItems.filter((item) => item.status === "tested_locally" || item.inheritedVsLocalBasis === "lived_local").length,
    failedImitationCount: diffusionItems.filter((item) =>
      item.status === "seen_not_understood" ||
      item.status === "copied_superficially" ||
      item.risks.includes("missing_tacit_steps") ||
      item.risks.includes("material_mismatch")).length,
    partialCopyCount: diffusionItems.filter((item) => item.status === "partial_copy" || item.status === "copied_superficially").length,
    seenNotUnderstoodCount: diffusionItems.filter((item) => item.status === "seen_not_understood" || item.status === "visible_trace_only").length,
    withholdingCount: diffusionItems.filter((item) => item.status === "withheld_or_not_shared" || item.risks.includes("withholding_possible")).length,
    rejectionCount: diffusionItems.filter((item) => item.status === "rejected_as_untrusted" || item.risks.includes("untrusted_source")).length,
    constraints: [
      "projection only: social diffusion is not stored and does not change choices",
      "reports, traces, and contact create exposure hooks, not skills or complete knowledge",
      "visible results can miss tacit steps and local material context",
      "parent and other-band evidence stays separate from local testing",
      "no diplomacy, trade, territory, culture, language, or social-network system is created",
    ],
    caps: {
      socialContextCap: SOCIAL_CONTEXT_CAP,
      diffusionItemCap: DIFFUSION_ITEM_CAP,
      itemsPerDomainCap: ITEMS_PER_DOMAIN_CAP,
      evidencePerItemCap: EVIDENCE_PER_ITEM_CAP,
      evidencePerContextCap: EVIDENCE_PER_CONTEXT_CAP,
      linkPerItemCap: LINK_PER_ITEM_CAP,
      contextRecordCap: CONTEXT_RECORD_CAP,
      capsHeld: socialContexts.length <= SOCIAL_CONTEXT_CAP &&
        diffusionItems.length <= DIFFUSION_ITEM_CAP &&
        DOMAINS.every((domain) => diffusionItems.filter((item) => item.domain === domain).length <= ITEMS_PER_DOMAIN_CAP) &&
        socialContexts.every((item) => item.evidence.length <= EVIDENCE_PER_CONTEXT_CAP) &&
        diffusionItems.every((item) =>
          item.evidence.length <= EVIDENCE_PER_ITEM_CAP &&
          item.linkedContextIds.length <= LINK_PER_ITEM_CAP &&
          item.linkedKnowledgeIds.length <= LINK_PER_ITEM_CAP &&
          item.linkedReportIds.length <= LINK_PER_ITEM_CAP &&
          item.linkedEventIds.length <= LINK_PER_ITEM_CAP &&
          item.linkedActivityIds.length <= LINK_PER_ITEM_CAP &&
          item.linkedAffordanceIds.length <= LINK_PER_ITEM_CAP &&
          item.linkedPracticeFeedbackIds.length <= LINK_PER_ITEM_CAP &&
          item.linkedFootholdIds.length <= LINK_PER_ITEM_CAP),
    },
    integrity: {
      selectedBandOnly: true,
      projectionOnly: true,
      noBehaviorInfluence: true,
      noDecisionInfluence: true,
      noSkillOrAdaptationState: true,
      noAutomaticImprovement: true,
      noCultureTabooMythWorldviewReligionLanguage: true,
      noDiplomacyAllianceTradeWarTerritoryProperty: true,
      noSocialNetworkKinshipMarriageSystem: true,
      noSettlementAgricultureDomesticationInventory: true,
      antiOmniscient: true,
      noHiddenOtherBandInternalState: true,
      inheritedSeparated: diffusionItems.length === 0 || diffusionItems.every((item) => item.inheritedVsLocalBasis !== "unknown"),
      daughterParentKnowledgeNotLocalTesting: band.parentBandId === undefined ||
        diffusionItems.every((item) => item.inheritedVsLocalBasis !== "inherited" || item.status === "inherited_story" || item.status === "inherited_practical_hint"),
      tacitKnowledgeRepresented: diffusionItems.some((item) => item.tacitDifficulty !== "low" || item.risks.includes("missing_tacit_steps")),
      compatibilityRepresented: diffusionItems.some((item) => item.compatibility !== "unknown_compatibility"),
      trustCautionRepresented: socialContexts.some((item) => item.trustFilter !== "no_social_basis") ||
        diffusionItems.some((item) => item.trustFilter !== "no_social_basis"),
      failedImitationRepresented: diffusionItems.some((item) =>
        item.status === "seen_not_understood" ||
        item.status === "partial_copy" ||
        item.status === "copied_superficially" ||
        item.risks.includes("missing_tacit_steps")),
    },
    chronicleIntegration: {
      mode: "inspected_skipped",
      reason: "Social-ecological diffusion stays in Between Bands and Technical; Chronicle prose is skipped until later systems record actual social learning, failed imitation events, or historical transmission.",
      brokenRenderedLinks: 0,
    },
    technicalProof: {
      payloadBytesEstimate: byteLengthUtf8(payloadDraft),
      maxContextPayloadBytes: maxJsonBytes(socialContexts),
      maxItemPayloadBytes: maxJsonBytes(diffusionItems),
      sourceIdSamples: uniqueStrings(allEvidence.map((entry) => entry.sourceId)).slice(0, SAMPLE_CAP),
      contextIdSamples: socialContexts.map((item) => item.id).slice(0, SAMPLE_CAP),
      reportIdSamples: uniqueStrings(diffusionItems.flatMap((item) => item.linkedReportIds)).slice(0, SAMPLE_CAP),
      knowledgeIdSamples: uniqueStrings(diffusionItems.flatMap((item) => item.linkedKnowledgeIds)).slice(0, SAMPLE_CAP),
      eventIdSamples: uniqueStrings(diffusionItems.flatMap((item) => item.linkedEventIds)).slice(0, SAMPLE_CAP),
      activityIdSamples: uniqueStrings(diffusionItems.flatMap((item) => item.linkedActivityIds)).slice(0, SAMPLE_CAP),
      affordanceIdSamples: uniqueStrings(diffusionItems.flatMap((item) => item.linkedAffordanceIds)).slice(0, SAMPLE_CAP),
      practiceFeedbackIdSamples: uniqueStrings(diffusionItems.flatMap((item) => item.linkedPracticeFeedbackIds)).slice(0, SAMPLE_CAP),
      footholdIdSamples: uniqueStrings(diffusionItems.flatMap((item) => item.linkedFootholdIds)).slice(0, SAMPLE_CAP),
      brokenRenderedLinks: 0,
      fakeDiplomacyTradeTerritoryCultureClaimCount: 0,
      fakeSkillAdaptationClaimCount: 0,
      hiddenInternalStateExposureCount: 0,
      decisionPathIsolation: true,
    },
  };
}

function buildContactContexts(context: SocialDiffusionContext): readonly SocialEcologicalContext[] {
  return context.contactMemories.slice(0, 4).map((contact) => {
    const related = context.world.bands[contact.otherBandId];
    const trustFilter = trustFromContact(contact);
    return {
      id: `social-context:contact:${context.band.id}:${contact.otherBandId}`,
      kind: "direct_contact",
      channel: "direct_contact",
      publicLabel: relationLabel(contact.relation),
      meaning: contact.tension > 0.45
        ? "Contact is remembered, but caution is part of how information may be heard."
        : "Contact can carry weak social knowledge, but nothing is automatically shared.",
      sourceBandId: contact.otherBandId,
      relatedBandIds: [contact.otherBandId],
      relation: contact.relation,
      trustFilter,
      contactBasis: "direct",
      confidence: clamp01(0.2 + contact.familiarity * 0.36 + contact.trustLikeTolerance * 0.26 + Math.min(0.18, contact.contactCount * 0.03)),
      recencyLine: contactRecencyLine(context.world, contact),
      sharedContextLine: related === undefined
        ? "The source band is remembered but not currently visible in the active band table."
        : `${related.name} is known through ${contact.contactCount} contact memory signal(s).`,
      evidence: [contactEvidence(context, contact)].slice(0, EVIDENCE_PER_CONTEXT_CAP),
      noDecisionInfluence: true,
      noTerritoryClaim: true,
    };
  });
}

function buildReportContexts(context: SocialDiffusionContext): readonly SocialEcologicalContext[] {
  return context.reports.slice(0, 3).map((report) => ({
    id: `social-context:report:${context.band.id}:${report.reportId}`,
    kind: reportChannel(report) === "activity_talk" ? "activity_talk" : "direct_contact",
    channel: reportChannel(report),
    publicLabel: reportTopicLabel(report.topic),
    meaning: reportMeaning(report),
    sourceBandId: report.sourceBandId,
    relatedBandIds: uniqueBandIds([report.sourceBandId, report.originalObserverBandId]),
    relation: report.trustBasis,
    trustFilter: trustFromReport(report),
    contactBasis: reportChannel(report) === "activity_talk" ? "indirect" : "direct",
    confidence: report.confidence,
    recencyLine: `heard ${Math.max(0, Number(context.world.time.tick) - Number(report.tickReceived))} tick(s) ago`,
    sharedContextLine: report.contactMechanism === undefined
      ? "Talk reached the band without a precise contact mechanism."
      : `Channel: ${report.contactMechanism.replace(/_/g, " ")}.`,
    evidence: [reportEvidence(report)].slice(0, EVIDENCE_PER_CONTEXT_CAP),
    noDecisionInfluence: true,
    noTerritoryClaim: true,
  }));
}

function buildSharedRangeContexts(context: SocialDiffusionContext): readonly SocialEcologicalContext[] {
  return context.rangeContexts
    .filter((item) =>
      item.awarenessLevel !== "none" ||
      item.sharedRangeTileCount > 0 ||
      item.sharedWaterCoreCount > 0 ||
      item.rangeRelation !== "unknown")
    .slice(0, 3)
    .map((item) => ({
      id: `social-context:range:${context.band.id}:${item.targetBandId}`,
      kind: "shared_route_water_country",
      channel: "shared_route_water_country",
      publicLabel: socialRelationLabel(item.relationKind),
      meaning: rangeContextMeaning(item),
      sourceBandId: item.targetBandId,
      relatedBandIds: [item.targetBandId],
      relation: item.relationKind,
      trustFilter: trustFromRangeContext(item),
      contactBasis: "shared_country",
      confidence: clamp01(item.confidence),
      recencyLine: item.lastEvidenceTick === undefined
        ? "range relation is inferred from remembered country, not a recent meeting"
        : `last contact evidence ${Math.max(0, Number(context.world.time.tick) - Number(item.lastEvidenceTick))} tick(s) ago`,
      sharedContextLine: `${item.rangeRelation.replace(/_/g, " ")} · shared range ${item.sharedRangeTileCount} · shared water ${item.sharedWaterCoreCount}`,
      evidence: [rangeEvidence(item)].slice(0, EVIDENCE_PER_CONTEXT_CAP),
      noDecisionInfluence: true,
      noTerritoryClaim: true,
    }));
}

function buildInheritanceContexts(context: SocialDiffusionContext): readonly SocialEcologicalContext[] {
  if (context.band.parentBandId === undefined && context.band.deepHistory?.founding.kind !== "fission_daughter") {
    return [];
  }
  const parentId = context.band.parentBandId ?? context.band.deepHistory?.founding.parentBandId;
  return [{
    id: `social-context:inheritance:${context.band.id}:${String(parentId ?? "unknown-parent")}`,
    kind: "parent_daughter_inheritance",
    channel: "parent_daughter",
    publicLabel: "Parent-carried memory",
    meaning: "Parent knowledge can arrive as warnings or hints, but local testing remains separate.",
    sourceBandId: parentId,
    relatedBandIds: parentId === undefined ? [] : [parentId],
    relation: "parent_daughter",
    trustFilter: "inherited_caution",
    contactBasis: "inherited",
    confidence: 0.62,
    recencyLine: "inherited at fission rather than earned from this country",
    sharedContextLine: inheritanceLine(context.band),
    evidence: [inheritanceEvidence(context.band)].slice(0, EVIDENCE_PER_CONTEXT_CAP),
    noDecisionInfluence: true,
    noTerritoryClaim: true,
  }];
}

function buildTraceContexts(context: SocialDiffusionContext): readonly SocialEcologicalContext[] {
  const factor = context.footholdFactors.find((item) =>
    item.status === "stale" ||
    item.family === "route_crossing_use" ||
    item.family === "temporary_storage_cache" ||
    item.family === "care_camp_organization") ?? context.footholdFactors[0];
  if (factor === undefined) {
    return [];
  }

  return [{
    id: `social-context:trace:${context.band.id}:${factor.id}`,
    kind: factor.status === "stale" ? "old_camp_trace" : "visible_trace",
    channel: factor.status === "stale" ? "old_camp_trace" : "visible_trace",
    publicLabel: "Visible camp or route trace",
    meaning: "A trace can hint at repeated use, but it does not reveal the full method or source.",
    relatedBandIds: [],
    relation: "source_unknown",
    trustFilter: "source_unknown",
    contactBasis: "trace",
    confidence: clamp01(factor.confidence * 0.8),
    recencyLine: factor.status === "stale" ? "old or fading trace" : "visible through current camp evidence",
    sharedContextLine: factor.publicLabel,
    evidence: [footholdEvidence(factor, "visible_trace")].slice(0, EVIDENCE_PER_CONTEXT_CAP),
    noDecisionInfluence: true,
    noTerritoryClaim: true,
  }];
}

function buildReportDiffusionItems(
  context: SocialDiffusionContext,
  socialContexts: readonly SocialEcologicalContext[],
): readonly SocialDiffusionItem[] {
  return context.reports.slice(0, 5).map((report) => {
    const domain = domainFromTopic(report.topic);
    const channel = reportChannel(report);
    const status = statusFromReport(context, report);
    const tacit = tacitDifficultyForDomain(domain);
    const compatibility = compatibilityForDomain(context, domain, status);
    const trustFilter = trustFromReport(report);
    const risks = risksForReport(report, tacit, compatibility, trustFilter, status);
    const basis = report.sourceBasis === "parent_band" || report.trustBasis === "parent" ? "inherited" : "heard";
    const evidence = [reportEvidence(report), ...matchingKnowledgeEvidence(context, domain).slice(0, 1)].slice(0, EVIDENCE_PER_ITEM_CAP);
    return makeDiffusionItem({
      id: `social-diffusion:report:${context.band.id}:${report.reportId}`,
      domain,
      channel,
      publicLabel: reportItemLabel(report, status),
      meaning: reportItemMeaning(report, status, tacit),
      sourceBandId: report.sourceBandId,
      sourceLabel: sourceLabelForReport(report),
      linkedContextIds: matchingContextIds(socialContexts, report.sourceBandId, channel),
      linkedKnowledgeIds: evidence.flatMap((entry) => entry.knowledgeId === undefined ? [] : [entry.knowledgeId]),
      linkedReportIds: [report.reportId],
      linkedEventIds: [],
      linkedActivityIds: [],
      linkedAffordanceIds: affordanceIdsForDomain(context, domain),
      linkedPracticeFeedbackIds: practiceIdsForDomain(context, domain),
      linkedFootholdIds: footholdIdsForDomain(context, domain),
      visibility: "heard",
      tacitDifficulty: tacit,
      compatibility,
      trustFilter,
      status,
      risks,
      inheritedVsLocalBasis: status === "tested_locally" ? "mixed" : basis,
      confidence: clamp01(report.confidence * 0.72 + report.freshness * 0.18 + (trustFilter === "trusted_enough_to_hear" ? 0.1 : 0)),
      evidence,
    });
  });
}

function buildSharedRangeDiffusionItems(
  context: SocialDiffusionContext,
  socialContexts: readonly SocialEcologicalContext[],
): readonly SocialDiffusionItem[] {
  return context.rangeContexts
    .filter((item) => item.sharedRangeTileCount > 0 || item.sharedWaterCoreCount > 0 || item.rangeRelation === "adjacent_ranges")
    .slice(0, 3)
    .map((item) => {
      const domain: SocialDiffusionDomain = item.sharedWaterCoreCount > 0 ? "water_edge" : "route_crossing";
      const compatibility = compatibilityForDomain(context, domain, "visible_trace_only");
      return makeDiffusionItem({
        id: `social-diffusion:shared-country:${context.band.id}:${item.targetBandId}`,
        domain,
        channel: "shared_route_water_country",
        publicLabel: item.sharedWaterCoreCount > 0 ? "Shared water signs" : "Shared route signs",
        meaning: "Another band can make a route or water place socially visible, but the reason for using it remains uncertain.",
        sourceBandId: item.targetBandId,
        sourceLabel: socialRelationLabel(item.relationKind),
        linkedContextIds: matchingContextIds(socialContexts, item.targetBandId, "shared_route_water_country"),
        linkedKnowledgeIds: matchingKnowledgeIds(context, domain),
        linkedReportIds: [],
        linkedEventIds: [],
        linkedActivityIds: [],
        linkedAffordanceIds: affordanceIdsForDomain(context, domain),
        linkedPracticeFeedbackIds: practiceIdsForDomain(context, domain),
        linkedFootholdIds: footholdIdsForDomain(context, domain),
        visibility: "shared_country",
        tacitDifficulty: domain === "route_crossing" ? "low" : "medium",
        compatibility,
        trustFilter: trustFromRangeContext(item),
        status: "visible_trace_only",
        risks: uniqueRisks(["missing_tacit_steps", "local_only"]),
        inheritedVsLocalBasis: "visible_trace",
        confidence: clamp01(item.confidence),
        evidence: [rangeEvidence(item)].slice(0, EVIDENCE_PER_ITEM_CAP),
      });
    });
}

function buildInheritanceDiffusionItems(
  context: SocialDiffusionContext,
  socialContexts: readonly SocialEcologicalContext[],
): readonly SocialDiffusionItem[] {
  if (context.band.parentBandId === undefined && context.band.deepHistory?.founding.kind !== "fission_daughter") {
    return [];
  }
  const founding = context.band.deepHistory?.founding;
  const inheritedCount =
    (founding?.inheritedKnowledgeCount ?? 0) +
    (founding?.inheritedMemoryCount ?? 0) +
    (founding?.inheritedCorridorCount ?? 0) +
    (founding?.inheritedCrossingCount ?? 0);
  const domain: SocialDiffusionDomain = (founding?.inheritedCrossingCount ?? 0) > 0 || (founding?.inheritedCorridorCount ?? 0) > 0
    ? "route_crossing"
    : "camp_foothold_care";
  const status: SocialDiffusionStatus = inheritedCount > 2 ? "inherited_practical_hint" : "inherited_story";
  const parentId = context.band.parentBandId ?? founding?.parentBandId;
  return [makeDiffusionItem({
    id: `social-diffusion:inheritance:${context.band.id}:${String(parentId ?? "unknown-parent")}`,
    domain,
    channel: "parent_daughter",
    publicLabel: status === "inherited_practical_hint" ? "Inherited practical hint" : "Inherited story",
    meaning: "Parent-carried knowledge may guide attention, but it is not the daughter band's local test.",
    sourceBandId: parentId,
    sourceLabel: "parent band",
    linkedContextIds: socialContexts.filter((item) => item.kind === "parent_daughter_inheritance").map((item) => item.id).slice(0, LINK_PER_ITEM_CAP),
    linkedKnowledgeIds: matchingKnowledgeIds(context, domain),
    linkedReportIds: [],
    linkedEventIds: [],
    linkedActivityIds: [],
    linkedAffordanceIds: affordanceIdsForDomain(context, domain),
    linkedPracticeFeedbackIds: practiceIdsForDomain(context, domain),
    linkedFootholdIds: footholdIdsForDomain(context, domain),
    visibility: "inherited",
    tacitDifficulty: domain === "route_crossing" ? "low" : "medium",
    compatibility: "inherited_from_different_country",
    trustFilter: "inherited_caution",
    status,
    risks: uniqueRisks(["place_mismatch", "missing_tacit_steps"]),
    inheritedVsLocalBasis: "inherited",
    confidence: clamp01(0.34 + Math.min(0.34, inheritedCount * 0.04)),
    evidence: [inheritanceEvidence(context.band)].slice(0, EVIDENCE_PER_ITEM_CAP),
  })];
}

function buildPracticeTraceDiffusionItems(
  context: SocialDiffusionContext,
  socialContexts: readonly SocialEcologicalContext[],
): readonly SocialDiffusionItem[] {
  const hasSocialSource = socialContexts.some((item) =>
    item.kind === "direct_contact" ||
    item.kind === "activity_talk" ||
    item.kind === "visible_trace" ||
    item.kind === "shared_route_water_country");
  if (!hasSocialSource) {
    return [];
  }
  return context.practiceItems.slice(0, 3).map((practice) => {
    const domain = domainFromPractice(practice);
    const compatibility = compatibilityForDomain(context, domain, practice.readinessStatus === "blocked_by_material" ? "blocked_by_material_context" : "seen_not_understood");
    const status: SocialDiffusionStatus =
      practice.readinessStatus === "learning_ready_later" ? "diffusion_ready_later" :
      practice.readinessStatus === "blocked_by_material" ? "blocked_by_material_context" :
      practice.readinessStatus === "blocked_by_labor" ? "blocked_by_labor" :
      "seen_not_understood";
    return makeDiffusionItem({
      id: `social-diffusion:practice-trace:${context.band.id}:${practice.id}`,
      domain,
      channel: "visible_trace",
      publicLabel: "Visible practice, missing steps",
      meaning: "A practice candidate can be seen or heard as a result, while the tacit sequence remains incomplete.",
      sourceLabel: "visible or heard practice",
      linkedContextIds: socialContexts.map((item) => item.id).slice(0, LINK_PER_ITEM_CAP),
      linkedKnowledgeIds: practice.linkedKnowledgeIds.slice(0, LINK_PER_ITEM_CAP),
      linkedReportIds: [],
      linkedEventIds: practice.linkedEventIds.slice(0, LINK_PER_ITEM_CAP),
      linkedActivityIds: practice.linkedActivityIds.slice(0, LINK_PER_ITEM_CAP),
      linkedAffordanceIds: practice.linkedAffordanceIds.slice(0, LINK_PER_ITEM_CAP),
      linkedPracticeFeedbackIds: [practice.id],
      linkedFootholdIds: practice.linkedFootholdIds.slice(0, LINK_PER_ITEM_CAP),
      visibility: "seen",
      tacitDifficulty: tacitDifficultyForDomain(domain),
      compatibility,
      trustFilter: "cautious_hearsay",
      status,
      risks: risksForPracticeTrace(practice, compatibility),
      inheritedVsLocalBasis: practice.inheritedVsLivedBasis === "inherited_not_lived" ? "inherited" : "mixed",
      confidence: clamp01(practice.confidence * 0.72),
      evidence: [practiceEvidence(practice)].slice(0, EVIDENCE_PER_ITEM_CAP),
    });
  });
}

function buildFootholdTraceDiffusionItems(
  context: SocialDiffusionContext,
  socialContexts: readonly SocialEcologicalContext[],
): readonly SocialDiffusionItem[] {
  return context.footholdFactors
    .filter((factor) =>
      factor.family === "route_crossing_use" ||
      factor.family === "temporary_storage_cache" ||
      factor.family === "care_camp_organization" ||
      factor.family === "fire_hearth_fuel" ||
      factor.status === "stale")
    .slice(0, 2)
    .map((factor) => {
      const domain = domainFromFoothold(factor);
      return makeDiffusionItem({
        id: `social-diffusion:foothold-trace:${context.band.id}:${factor.id}`,
        domain,
        channel: factor.status === "stale" ? "old_camp_trace" : "visible_trace",
        publicLabel: "Camp trace without full method",
        meaning: "Camp or route traces can show repeated use without explaining the practical routine.",
        sourceLabel: "camp trace",
        linkedContextIds: socialContexts.filter((item) => item.kind === "visible_trace" || item.kind === "old_camp_trace").map((item) => item.id).slice(0, LINK_PER_ITEM_CAP),
        linkedKnowledgeIds: factor.relatedKnowledgeIds.slice(0, LINK_PER_ITEM_CAP),
        linkedReportIds: [],
        linkedEventIds: factor.relatedEventIds.slice(0, LINK_PER_ITEM_CAP),
        linkedActivityIds: [],
        linkedAffordanceIds: factor.relatedAffordanceIds.slice(0, LINK_PER_ITEM_CAP),
        linkedPracticeFeedbackIds: practiceIdsForDomain(context, domain),
        linkedFootholdIds: [factor.id],
        visibility: "trace",
        tacitDifficulty: tacitDifficultyForDomain(domain),
        compatibility: compatibilityForDomain(context, domain, "visible_trace_only"),
        trustFilter: "source_unknown",
        status: "visible_trace_only",
        risks: uniqueRisks(["missing_tacit_steps", "local_only"]),
        inheritedVsLocalBasis: factor.livedBasis === "inherited_not_lived" ? "inherited" : "visible_trace",
        confidence: clamp01(factor.confidence * 0.72),
        evidence: [footholdEvidence(factor, "foothold")].slice(0, EVIDENCE_PER_ITEM_CAP),
      });
    });
}

function buildSpeculationDiffusionItems(
  context: SocialDiffusionContext,
  socialContexts: readonly SocialEcologicalContext[],
): readonly SocialDiffusionItem[] {
  return context.speculations.slice(0, 2).map((spec) => {
    const domain = domainFromSpeculation(spec.hypothesis);
    return makeDiffusionItem({
      id: `social-diffusion:speculation:${context.band.id}:${spec.speculationId}`,
      domain,
      channel: "activity_talk",
      publicLabel: "Talk that may be wrong",
      meaning: "The band is carrying a social or camp speculation; it is not practical knowledge.",
      sourceLabel: "camp talk",
      linkedContextIds: socialContexts.filter((item) => item.channel === "activity_talk").map((item) => item.id).slice(0, LINK_PER_ITEM_CAP),
      linkedKnowledgeIds: matchingKnowledgeIds(context, domain),
      linkedReportIds: spec.sourceReports.slice(0, LINK_PER_ITEM_CAP),
      linkedEventIds: [],
      linkedActivityIds: [],
      linkedAffordanceIds: affordanceIdsForDomain(context, domain),
      linkedPracticeFeedbackIds: practiceIdsForDomain(context, domain),
      linkedFootholdIds: footholdIdsForDomain(context, domain),
      visibility: "uncertain",
      tacitDifficulty: "unknown",
      compatibility: "unknown_compatibility",
      trustFilter: "cautious_hearsay",
      status: spec.receiverDisposition === "disproven" || spec.contradictionCount > 0 ? "rejected_as_untrusted" : "heard_not_practiced",
      risks: uniqueRisks(["distorted_or_stale", "false_confidence"]),
      inheritedVsLocalBasis: "heard",
      confidence: spec.confidence,
      evidence: [speculationEvidence(spec)].slice(0, EVIDENCE_PER_ITEM_CAP),
    });
  });
}

function buildWithholdingDiffusionItems(
  context: SocialDiffusionContext,
  socialContexts: readonly SocialEcologicalContext[],
): readonly SocialDiffusionItem[] {
  const withheld = context.band.reportedKnowledge?.sourceBiasWithheldCount ?? 0;
  if (withheld <= 0) {
    return [];
  }
  return [makeDiffusionItem({
    id: `social-diffusion:withheld:${context.band.id}:${context.band.reportedKnowledge?.lastUpdatedTick ?? context.world.time.tick}`,
    domain: "social_contact",
    channel: "direct_contact",
    publicLabel: "Some practical talk may not have been shared",
    meaning: "Withholding is only a cautious source-bias signal; no strategy or deception system exists.",
    sourceLabel: "cautious contact",
    linkedContextIds: socialContexts.filter((item) => item.kind === "direct_contact" || item.kind === "activity_talk").map((item) => item.id).slice(0, LINK_PER_ITEM_CAP),
    linkedKnowledgeIds: [],
    linkedReportIds: [],
    linkedEventIds: [],
    linkedActivityIds: [],
    linkedAffordanceIds: [],
    linkedPracticeFeedbackIds: [],
    linkedFootholdIds: [],
    visibility: "uncertain",
    tacitDifficulty: "unknown",
    compatibility: "unknown_compatibility",
    trustFilter: "cautious_hearsay",
    status: "withheld_or_not_shared",
    risks: uniqueRisks(["withholding_possible", "untrusted_source"]),
    inheritedVsLocalBasis: "unknown",
    confidence: clamp01(Math.min(0.62, 0.28 + withheld * 0.08)),
    evidence: [{
      kind: "report",
      sourceSystem: "reported_knowledge",
      label: `${withheld} withheld source-bias signal(s)`,
      sourceId: `reported-knowledge:withheld:${String(context.band.id)}`,
      confidence: clamp01(0.42),
      basis: "heard",
      reasonIds: [],
    }],
  })];
}

interface DiffusionItemInput {
  readonly id: string;
  readonly domain: SocialDiffusionDomain;
  readonly channel: SocialDiffusionChannel;
  readonly publicLabel: string;
  readonly meaning: string;
  readonly sourceBandId?: BandId;
  readonly sourceLabel: string;
  readonly linkedContextIds: readonly string[];
  readonly linkedKnowledgeIds: readonly string[];
  readonly linkedReportIds: readonly string[];
  readonly linkedEventIds: readonly string[];
  readonly linkedActivityIds: readonly string[];
  readonly linkedAffordanceIds: readonly string[];
  readonly linkedPracticeFeedbackIds: readonly string[];
  readonly linkedFootholdIds: readonly string[];
  readonly visibility: SocialDiffusionItem["visibility"];
  readonly tacitDifficulty: SocialDiffusionTacitDifficulty;
  readonly compatibility: SocialDiffusionCompatibility;
  readonly trustFilter: SocialDiffusionTrustFilter;
  readonly status: SocialDiffusionStatus;
  readonly risks: readonly SocialDiffusionRisk[];
  readonly inheritedVsLocalBasis: SocialDiffusionBasis;
  readonly confidence: NormalizedIntensity;
  readonly evidence: readonly SocialDiffusionEvidenceRef[];
}

function makeDiffusionItem(input: DiffusionItemInput): SocialDiffusionItem {
  return {
    ...input,
    linkedContextIds: uniqueStrings(input.linkedContextIds).slice(0, LINK_PER_ITEM_CAP),
    linkedKnowledgeIds: uniqueStrings(input.linkedKnowledgeIds).slice(0, LINK_PER_ITEM_CAP),
    linkedReportIds: uniqueStrings(input.linkedReportIds).slice(0, LINK_PER_ITEM_CAP),
    linkedEventIds: uniqueStrings(input.linkedEventIds).slice(0, LINK_PER_ITEM_CAP),
    linkedActivityIds: uniqueStrings(input.linkedActivityIds).slice(0, LINK_PER_ITEM_CAP),
    linkedAffordanceIds: uniqueStrings(input.linkedAffordanceIds).slice(0, LINK_PER_ITEM_CAP),
    linkedPracticeFeedbackIds: uniqueStrings(input.linkedPracticeFeedbackIds).slice(0, LINK_PER_ITEM_CAP),
    linkedFootholdIds: uniqueStrings(input.linkedFootholdIds).slice(0, LINK_PER_ITEM_CAP),
    transferDifficulty: input.tacitDifficulty,
    risks: uniqueRisks(input.risks).slice(0, LINK_PER_ITEM_CAP),
    evidence: input.evidence.slice(0, EVIDENCE_PER_ITEM_CAP),
    sourceSystems: uniqueSourceSystems(input.evidence).slice(0, LINK_PER_ITEM_CAP),
    noSkillUnlocked: true,
    noAutomaticImprovement: true,
    noDecisionInfluence: true,
    diffusionReadyLaterIsNotKnowledge: true,
    futureHook: "interband_social_learning_candidate",
  };
}

function contactEvidence(context: SocialDiffusionContext, contact: KnownBandContactMemory): SocialDiffusionEvidenceRef {
  return {
    kind: "contact",
    sourceSystem: "contact_memory",
    label: `${contact.contactCount} remembered contact(s)`,
    sourceId: `contact:${String(context.band.id)}:${String(contact.otherBandId)}`,
    confidence: clamp01(contact.familiarity),
    basis: "lived_local",
    sourceBandId: contact.otherBandId,
    relatedBandId: contact.otherBandId,
    reasonIds: contact.reasonIds,
  };
}

function reportEvidence(report: WordOfMouthReport): SocialDiffusionEvidenceRef {
  return {
    kind: "report",
    sourceSystem: "reported_knowledge",
    label: reportTopicLabel(report.topic),
    sourceId: report.reportId,
    confidence: report.confidence,
    basis: report.sourceBasis === "parent_band" || report.trustBasis === "parent" ? "inherited" : "heard",
    sourceBandId: report.sourceBandId,
    relatedBandId: report.receiverBandId,
    reportId: report.reportId,
    tileId: report.targetTileId,
    reasonIds: report.reasonIds,
  };
}

function speculationEvidence(spec: ReportedKnowledgeSpeculation): SocialDiffusionEvidenceRef {
  return {
    kind: "speculation",
    sourceSystem: "reported_knowledge",
    label: spec.hypothesis.replace(/_/g, " "),
    sourceId: spec.speculationId,
    confidence: spec.confidence,
    basis: "heard",
    reportId: spec.speculationId,
    tileId: spec.regionTarget.approximateCenterTile,
    reasonIds: [],
  };
}

function rangeEvidence(range: RecognizedRangeContext): SocialDiffusionEvidenceRef {
  return {
    kind: "range_context",
    sourceSystem: "social_range_recognition",
    label: `${range.awarenessLevel.replace(/_/g, " ")} · ${range.rangeRelation.replace(/_/g, " ")}`,
    sourceId: `range:${String(range.observerBandId)}:${String(range.targetBandId)}`,
    confidence: clamp01(range.confidence),
    basis: "visible_trace",
    sourceBandId: range.targetBandId,
    relatedBandId: range.targetBandId,
    reasonIds: [],
  };
}

function inheritanceEvidence(band: Band): SocialDiffusionEvidenceRef {
  const founding = band.deepHistory?.founding;
  return {
    kind: "inheritance",
    sourceSystem: "fission_inheritance",
    label: inheritanceLine(band),
    sourceId: `inheritance:${String(band.id)}:${String(band.parentBandId ?? founding?.parentBandId ?? "unknown")}`,
    confidence: clamp01(0.58),
    basis: "inherited",
    sourceBandId: band.parentBandId ?? founding?.parentBandId,
    relatedBandId: band.id,
    reasonIds: founding?.creationReasonIds ?? [],
  };
}

function practiceEvidence(item: PracticeFeedbackReadinessItem): SocialDiffusionEvidenceRef {
  return {
    kind: "practice_feedback",
    sourceSystem: "practice_feedback",
    label: item.publicLabel,
    sourceId: item.id,
    confidence: item.confidence,
    basis: item.inheritedVsLivedBasis === "inherited_not_lived" ? "inherited" : "mixed",
    practiceFeedbackId: item.id,
    reasonIds: [],
  };
}

function footholdEvidence(item: CampFootholdFactor, kind: "visible_trace" | "foothold"): SocialDiffusionEvidenceRef {
  return {
    kind,
    sourceSystem: "camp_foothold",
    label: item.publicLabel,
    sourceId: item.id,
    confidence: item.confidence,
    basis: item.livedBasis === "inherited_not_lived" ? "inherited" : "visible_trace",
    footholdId: item.id,
    reasonIds: item.evidence.flatMap((entry) => entry.reasonIds).slice(0, LINK_PER_ITEM_CAP),
  };
}

function matchingKnowledgeEvidence(context: SocialDiffusionContext, domain: SocialDiffusionDomain): readonly SocialDiffusionEvidenceRef[] {
  return context.knowledgeItems
    .filter((item) => knowledgeDomainMatches(item.domain, domain))
    .slice(0, 1)
    .map((item) => ({
      kind: "knowledge",
      sourceSystem: "knowledge_ecology",
      label: item.title,
      sourceId: item.id,
      confidence: item.confidence,
      basis: item.livedStatus === "inherited_not_personally_lived" ? "inherited" : "mixed",
      knowledgeId: item.id,
      reasonIds: item.evidence.flatMap((entry) => entry.reasonIds).slice(0, LINK_PER_ITEM_CAP),
    }));
}

function capSocialContexts(items: readonly SocialEcologicalContext[]): readonly SocialEcologicalContext[] {
  return uniqueById(items)
    .sort((left, right) => contextScore(right) - contextScore(left) || left.id.localeCompare(right.id))
    .slice(0, SOCIAL_CONTEXT_CAP);
}

function capDiffusionItems(items: readonly SocialDiffusionItem[]): readonly SocialDiffusionItem[] {
  const counts = new Map<SocialDiffusionDomain, number>();
  return uniqueById(items)
    .sort((left, right) => diffusionScore(right) - diffusionScore(left) || left.id.localeCompare(right.id))
    .filter((item) => {
      const count = counts.get(item.domain) ?? 0;
      if (count >= ITEMS_PER_DOMAIN_CAP) {
        return false;
      }
      counts.set(item.domain, count + 1);
      return true;
    })
    .slice(0, DIFFUSION_ITEM_CAP);
}

function contextScore(item: SocialEcologicalContext): number {
  return item.confidence +
    (item.kind === "direct_contact" ? 0.35 : 0) +
    (item.kind === "parent_daughter_inheritance" ? 0.28 : 0) +
    (item.kind === "shared_route_water_country" ? 0.24 : 0) +
    item.evidence.length * 0.05;
}

function diffusionScore(item: SocialDiffusionItem): number {
  return item.confidence +
    (item.status === "diffusion_ready_later" ? 0.28 : 0) +
    (item.status === "tested_locally" ? 0.24 : 0) +
    (item.channel === "parent_daughter" ? 0.18 : 0) +
    (item.channel === "direct_contact" ? 0.16 : 0) +
    item.evidence.length * 0.06;
}

function statusFromReport(context: SocialDiffusionContext, report: WordOfMouthReport): SocialDiffusionStatus {
  if (report.withheldBySourceBias === true || report.sourceBiasKind !== undefined && report.sourceBiasKind !== "none" && report.confidence < 0.42) {
    return "withheld_or_not_shared";
  }
  if (report.receiverDisposition === "ignored" || report.confirmationStatus === "disputed") {
    return "rejected_as_untrusted";
  }
  if (report.confirmationStatus === "contradicted" || report.confirmationStatus === "downgraded") {
    return "dead_end_risk";
  }
  if (report.confirmationStatus === "confirmed" || report.confirmationStatus === "partially_confirmed" || report.receiverDisposition === "checked_by_probe") {
    return "tested_locally";
  }
  if (report.sourceBasis === "parent_band") {
    return "inherited_story";
  }
  if (report.targetTileId !== undefined && context.band.knowledge.observedTiles[report.targetTileId] === undefined) {
    return "heard_not_practiced";
  }
  if (report.distortionLevel !== "none" && report.distortionLevel !== "vague") {
    return "partial_copy";
  }
  return "compatible_but_untried";
}

function trustFromContact(contact: KnownBandContactMemory): SocialDiffusionTrustFilter {
  if (contact.tension > 0.58 || contact.avoidanceCount > contact.peacefulContactCount) {
    return "avoids_source";
  }
  if (contact.relation === "parent_daughter" || contact.relation === "siblings") {
    return contact.tension > 0.38 ? "inherited_caution" : "friendly_contact";
  }
  if (contact.trustLikeTolerance > 0.58 && contact.familiarity > 0.48) {
    return "trusted_enough_to_hear";
  }
  if (contact.tension > 0.36 || contact.strainedContactCount > 0) {
    return "tense_contact";
  }
  return "cautious_hearsay";
}

function trustFromReport(report: WordOfMouthReport): SocialDiffusionTrustFilter {
  if (report.trustBasis === "parent" || report.trustBasis === "daughter" || report.trustBasis === "sibling" || report.trustBasis === "lineage_kin") {
    return "friendly_contact";
  }
  if (report.trustBasis === "stranger" || report.trustBasis === "weak_contact") {
    return report.receiverDisposition === "ignored" ? "avoids_source" : "cautious_hearsay";
  }
  if (report.trustBasis === "range_friction") {
    return "tense_contact";
  }
  if (report.confidence > 0.58 && report.freshness > 0.48) {
    return "trusted_enough_to_hear";
  }
  return "cautious_hearsay";
}

function trustFromRangeContext(range: RecognizedRangeContext): SocialDiffusionTrustFilter {
  if (range.relationKind === "parent" || range.relationKind === "daughter" || range.relationKind === "sibling" || range.relationKind === "lineage_kin") {
    return "friendly_contact";
  }
  if (range.awarenessLevel === "recognized" || range.awarenessLevel === "familiar") {
    return "trusted_enough_to_hear";
  }
  if (range.awarenessLevel === "glimpsed" || range.awarenessLevel === "suspected") {
    return "cautious_hearsay";
  }
  return "source_unknown";
}

function compatibilityForDomain(
  context: SocialDiffusionContext,
  domain: SocialDiffusionDomain,
  status: SocialDiffusionStatus,
): SocialDiffusionCompatibility {
  if (status === "inherited_story" || status === "inherited_practical_hint") {
    return "inherited_from_different_country";
  }
  if (context.band.demography.workingAdults < Math.max(3, context.band.demography.dependents)) {
    return "not_enough_labor";
  }
  const affordanceMatch = context.affordances.some((item) => affordanceMatchesDomain(item.family, domain) && item.status !== "absent" && item.status !== "unsupported_by_current_data");
  const footholdMatch = context.footholdFactors.some((item) => footholdMatchesDomain(item.family, domain));
  const practiceBlocked = context.practiceItems.some((item) =>
    practiceDomainMatches(item.family, domain) &&
    (item.readinessStatus === "blocked_by_material" || item.readinessStatus === "blocked_by_labor"));

  if (practiceBlocked && !affordanceMatch) {
    return "mismatched_material";
  }
  if (!affordanceMatch && (domain === "material_affordance" || domain === "fire_hearth_fuel" || domain === "water_edge")) {
    return "mismatched_material";
  }
  if (!footholdMatch && (domain === "camp_foothold_care" || domain === "fire_hearth_fuel")) {
    return "mismatched_place";
  }
  if (affordanceMatch && footholdMatch) {
    return "compatible";
  }
  if (affordanceMatch || footholdMatch || matchingKnowledgeIds(context, domain).length > 0) {
    return "weakly_compatible";
  }
  return "unknown_compatibility";
}

function risksForReport(
  report: WordOfMouthReport,
  tacit: SocialDiffusionTacitDifficulty,
  compatibility: SocialDiffusionCompatibility,
  trustFilter: SocialDiffusionTrustFilter,
  status: SocialDiffusionStatus,
): readonly SocialDiffusionRisk[] {
  const risks: SocialDiffusionRisk[] = [];
  if (tacit === "medium" || tacit === "high" || tacit === "unknown") risks.push("missing_tacit_steps");
  if (report.distortionLevel !== "none" || report.freshness < 0.36 || report.hops > 1) risks.push("distorted_or_stale");
  if (trustFilter === "avoids_source" || trustFilter === "tense_contact" || status === "rejected_as_untrusted") risks.push("untrusted_source");
  if (report.sourceBiasKind !== undefined && report.sourceBiasKind !== "none" || report.withheldBySourceBias === true) risks.push("withholding_possible");
  if (compatibility === "mismatched_material") risks.push("material_mismatch");
  if (compatibility === "mismatched_place" || compatibility === "inherited_from_different_country") risks.push("place_mismatch");
  if (compatibility === "not_enough_labor") risks.push("labor_blocked");
  if (status === "dead_end_risk") risks.push("dead_end");
  if (status === "partial_copy" || status === "copied_superficially") risks.push("false_confidence");
  return uniqueRisks(risks);
}

function risksForPracticeTrace(
  item: PracticeFeedbackReadinessItem,
  compatibility: SocialDiffusionCompatibility,
): readonly SocialDiffusionRisk[] {
  const risks: SocialDiffusionRisk[] = ["missing_tacit_steps"];
  if (item.risks.includes("dead_end")) risks.push("dead_end");
  if (item.risks.includes("false_confidence")) risks.push("false_confidence");
  if (item.risks.includes("local_only")) risks.push("local_only");
  if (compatibility === "mismatched_material") risks.push("material_mismatch");
  if (compatibility === "mismatched_place") risks.push("place_mismatch");
  if (compatibility === "not_enough_labor") risks.push("labor_blocked");
  return uniqueRisks(risks);
}

function reportChannel(report: WordOfMouthReport): SocialDiffusionChannel {
  if (report.sourceBasis === "parent_band" || report.sourceBasis === "daughter_band" || report.sourceBasis === "sibling_band" || report.sourceBasis === "lineage_kin") {
    return "parent_daughter";
  }
  if (report.contactMechanism === "shared_ford_or_crossing" || report.contactMechanism === "shared_water_place" || report.contactMechanism === "known_route_or_corridor" || report.contactMechanism === "range_shared_use") {
    return "shared_route_water_country";
  }
  if (isActivityTalkSource(report.sourceBasis)) {
    return "activity_talk";
  }
  return "direct_contact";
}

function isActivityTalkSource(source: string): boolean {
  return /trip|return|party|forager|fishing|water|hunter|gathering|camp_talk|elder|movers|route_followers|crossing_party|seasonal|internal/.test(source);
}

function domainFromTopic(topic: ReportedKnowledgeTopic): SocialDiffusionDomain {
  if (/ford|crossing|route|tributary|creek|pass|side_country/.test(topic)) return "route_crossing";
  if (/fishing|water|delta|wetland/.test(topic)) return "water_edge";
  if (/camp|return_to_known_place/.test(topic)) return "camp_foothold_care";
  if (/animal|hunting|gathering|seasonal|return|poor/.test(topic)) return "food_work";
  if (/crowded|outsider|avoid|unknown/.test(topic)) return "social_contact";
  return "material_affordance";
}

function domainFromSpeculation(hypothesis: ReportedKnowledgeSpeculation["hypothesis"]): SocialDiffusionDomain {
  switch (hypothesis) {
    case "route_likely_continues":
      return "route_crossing";
    case "fish_likely":
    case "water_likely":
      return "water_edge";
    case "animals_likely":
    case "better_land_possible":
      return "food_work";
    case "risk_likely":
    case "crowding_likely":
    case "poor_return_likely":
      return "social_contact";
  }
}

function domainFromPractice(item: PracticeFeedbackReadinessItem): SocialDiffusionDomain {
  switch (item.family) {
    case "route_crossing":
      return "route_crossing";
    case "food_work_processing":
      return "food_work";
    case "camp_setup_care":
      return "camp_foothold_care";
    case "fire_hearth_fuel":
      return "fire_hearth_fuel";
    case "water_edge_capture":
      return "water_edge";
    case "carrying_fiber_handling":
    case "tool_digging_cutting":
      return "material_affordance";
  }
}

function domainFromFoothold(item: CampFootholdFactor): SocialDiffusionDomain {
  switch (item.family) {
    case "route_crossing_use":
      return "route_crossing";
    case "water_refuge":
    case "food_processing_place":
    case "temporary_storage_cache":
      return "water_edge";
    case "fire_hearth_fuel":
      return "fire_hearth_fuel";
    case "care_camp_organization":
    case "shelter_exposure":
    case "repeated_return":
    case "camp_ecology_wear":
    case "safety_risk":
      return "camp_foothold_care";
  }
}

function tacitDifficultyForDomain(domain: SocialDiffusionDomain): SocialDiffusionTacitDifficulty {
  switch (domain) {
    case "route_crossing":
    case "social_contact":
      return "low";
    case "camp_foothold_care":
    case "food_work":
    case "water_edge":
      return "medium";
    case "material_affordance":
    case "fire_hearth_fuel":
      return "high";
  }
}

function affordanceMatchesDomain(family: string, domain: SocialDiffusionDomain): boolean {
  switch (domain) {
    case "route_crossing":
      return family === "route_crossing_engineering" || family === "carrying_containers_cordage";
    case "food_work":
      return family === "food_processing" || family === "tool_cutting_scraping_digging";
    case "camp_foothold_care":
      return family === "shelter_camp_structure" || family === "camp_organization_care";
    case "material_affordance":
      return family === "carrying_containers_cordage" || family === "tool_cutting_scraping_digging";
    case "fire_hearth_fuel":
      return family === "fire_hearth_fuel";
    case "water_edge":
      return family === "water_edge_trapping" || family === "carrying_containers_cordage";
    case "social_contact":
      return false;
  }
}

function footholdMatchesDomain(family: string, domain: SocialDiffusionDomain): boolean {
  switch (domain) {
    case "route_crossing":
      return family === "route_crossing_use";
    case "food_work":
      return family === "food_processing_place" || family === "temporary_storage_cache";
    case "camp_foothold_care":
      return family === "care_camp_organization" || family === "shelter_exposure" || family === "repeated_return";
    case "material_affordance":
      return family === "temporary_storage_cache" || family === "camp_ecology_wear";
    case "fire_hearth_fuel":
      return family === "fire_hearth_fuel";
    case "water_edge":
      return family === "water_refuge" || family === "food_processing_place";
    case "social_contact":
      return family === "safety_risk" || family === "route_crossing_use";
  }
}

function practiceDomainMatches(family: string, domain: SocialDiffusionDomain): boolean {
  switch (family) {
    case "route_crossing":
      return domain === "route_crossing";
    case "food_work_processing":
      return domain === "food_work";
    case "camp_setup_care":
      return domain === "camp_foothold_care";
    case "fire_hearth_fuel":
      return domain === "fire_hearth_fuel";
    case "water_edge_capture":
      return domain === "water_edge";
    case "carrying_fiber_handling":
    case "tool_digging_cutting":
      return domain === "material_affordance";
    default:
      return false;
  }
}

function knowledgeDomainMatches(domain: string, target: SocialDiffusionDomain): boolean {
  switch (target) {
    case "route_crossing":
      return domain === "route_corridor" || domain === "crossing" || domain === "place_country";
    case "food_work":
      return domain === "food_work" || domain === "place_country";
    case "camp_foothold_care":
      return domain === "place_country" || domain === "water_refuge";
    case "material_affordance":
      return domain === "food_work" || domain === "place_country";
    case "fire_hearth_fuel":
      return domain === "place_country";
    case "water_edge":
      return domain === "water_refuge" || domain === "food_work";
    case "social_contact":
      return domain === "social_contact" || domain === "place_country";
  }
}

function affordanceIdsForDomain(context: SocialDiffusionContext, domain: SocialDiffusionDomain): readonly string[] {
  return context.affordances
    .filter((item) => affordanceMatchesDomain(item.family, domain))
    .map((item) => item.id)
    .slice(0, LINK_PER_ITEM_CAP);
}

function matchingKnowledgeIds(context: SocialDiffusionContext, domain: SocialDiffusionDomain): readonly string[] {
  return context.knowledgeItems
    .filter((item) => knowledgeDomainMatches(item.domain, domain))
    .map((item) => item.id)
    .slice(0, LINK_PER_ITEM_CAP);
}

function practiceIdsForDomain(context: SocialDiffusionContext, domain: SocialDiffusionDomain): readonly string[] {
  return context.practiceItems
    .filter((item) => domainFromPractice(item) === domain)
    .map((item) => item.id)
    .slice(0, LINK_PER_ITEM_CAP);
}

function footholdIdsForDomain(context: SocialDiffusionContext, domain: SocialDiffusionDomain): readonly string[] {
  return context.footholdFactors
    .filter((item) => domainFromFoothold(item) === domain)
    .map((item) => item.id)
    .slice(0, LINK_PER_ITEM_CAP);
}

function matchingContextIds(
  socialContexts: readonly SocialEcologicalContext[],
  sourceBandId: BandId | undefined,
  channel: SocialDiffusionChannel,
): readonly string[] {
  return socialContexts
    .filter((item) =>
      item.channel === channel ||
      (sourceBandId !== undefined && item.relatedBandIds.includes(sourceBandId)))
    .map((item) => item.id)
    .slice(0, LINK_PER_ITEM_CAP);
}

function uniqueSourceSystems(evidence: readonly SocialDiffusionEvidenceRef[]): readonly SocialDiffusionSourceSystem[] {
  const seen = new Set<SocialDiffusionSourceSystem>();
  const out: SocialDiffusionSourceSystem[] = [];
  for (const item of evidence) {
    if (!seen.has(item.sourceSystem)) {
      seen.add(item.sourceSystem);
      out.push(item.sourceSystem);
    }
  }
  return out;
}

function uniqueRisks(risks: readonly SocialDiffusionRisk[]): readonly SocialDiffusionRisk[] {
  const order: readonly SocialDiffusionRisk[] = [
    "missing_tacit_steps",
    "distorted_or_stale",
    "untrusted_source",
    "withholding_possible",
    "material_mismatch",
    "place_mismatch",
    "labor_blocked",
    "local_only",
    "false_confidence",
    "dead_end",
  ];
  return order.filter((item) => risks.includes(item));
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (value.length > 0 && !seen.has(value)) {
      seen.add(value);
      out.push(value);
    }
  }
  return out;
}

function uniqueBandIds(values: readonly (BandId | undefined)[]): readonly BandId[] {
  const seen = new Set<string>();
  const out: BandId[] = [];
  for (const value of values) {
    if (value !== undefined && !seen.has(String(value))) {
      seen.add(String(value));
      out.push(value);
    }
  }
  return out;
}

function uniqueById<T extends { readonly id: string }>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      out.push(item);
    }
  }
  return out;
}

function countByKey<K extends string>(keys: readonly K[], values: readonly K[]): Readonly<Record<K, number>> {
  const entries = keys.map((key) => [key, values.filter((value) => value === key).length] as const);
  return Object.fromEntries(entries) as Record<K, number>;
}

function uniqueCount(values: readonly string[]): number {
  return uniqueStrings(values).length;
}

function compareContacts(left: KnownBandContactMemory, right: KnownBandContactMemory): number {
  return contactScore(right) - contactScore(left) || String(left.otherBandId).localeCompare(String(right.otherBandId));
}

function contactScore(contact: KnownBandContactMemory): number {
  return contact.familiarity + contact.trustLikeTolerance + contact.contactCount * 0.03 + Number(contact.lastContactAt.tick) * 0.0001 - contact.tension * 0.2;
}

function compareReports(left: WordOfMouthReport, right: WordOfMouthReport): number {
  return Number(right.tickReceived) - Number(left.tickReceived) ||
    right.confidence - left.confidence ||
    left.reportId.localeCompare(right.reportId);
}

function compareSpeculations(left: ReportedKnowledgeSpeculation, right: ReportedKnowledgeSpeculation): number {
  return Number(right.tick) - Number(left.tick) ||
    right.confidence - left.confidence ||
    left.speculationId.localeCompare(right.speculationId);
}

function compareTrips(left: IntraSeasonTripRecord, right: IntraSeasonTripRecord): number {
  return Number(right.tick) - Number(left.tick) ||
    String(left.targetTileId).localeCompare(String(right.targetTileId)) ||
    left.groupLabel.localeCompare(right.groupLabel);
}

function contactRecencyLine(contextWorld: WorldState, contact: KnownBandContactMemory): string {
  const age = Math.max(0, Number(contextWorld.time.tick) - Number(contact.lastContactAt.tick));
  return age === 0 ? "contact updated this tick" : `last contact memory ${age} tick(s) old`;
}

function relationLabel(relation: KnownBandContactMemory["relation"]): string {
  switch (relation) {
    case "parent_daughter":
      return "Parent/daughter contact";
    case "siblings":
      return "Sibling-band contact";
    case "unrelated":
      return "Known neighbouring band";
    case "unknown":
      return "Uncertain contact";
  }
}

function socialRelationLabel(relation: string): string {
  return relation.replace(/_/g, " ");
}

function rangeContextMeaning(item: RecognizedRangeContext): string {
  if (item.sharedWaterCoreCount > 0) {
    return "Remembered water use overlaps enough to make another band socially visible.";
  }
  if (item.sharedRangeTileCount > 0) {
    return "Familiar country overlaps, but this is not territory or access right.";
  }
  return "A nearby range edge is suspected from memory, not from exact knowledge.";
}

function inheritanceLine(band: Band): string {
  const founding = band.deepHistory?.founding;
  const inherited =
    (founding?.inheritedKnowledgeCount ?? 0) +
    (founding?.inheritedMemoryCount ?? 0) +
    (founding?.inheritedCorridorCount ?? 0) +
    (founding?.inheritedCrossingCount ?? 0);
  return inherited > 0
    ? `${inherited} inherited knowledge/memory signal(s), not local testing`
    : "parent relation exists, but local testing is not assumed";
}

function reportMeaning(report: WordOfMouthReport): string {
  if (report.distortionLevel !== "none") {
    return "The report is socially carried and may be partial, stale, or distorted.";
  }
  if (report.confirmationStatus === "confirmed" || report.confirmationStatus === "partially_confirmed") {
    return "The band has some local grounding for this report, but it is still not a skill.";
  }
  return "The report can point attention, but talk alone is not practical knowledge.";
}

function reportItemLabel(report: WordOfMouthReport, status: SocialDiffusionStatus): string {
  if (status === "tested_locally") {
    return `${reportTopicLabel(report.topic)} partly checked`;
  }
  if (status === "rejected_as_untrusted") {
    return `${reportTopicLabel(report.topic)} is not trusted`;
  }
  if (status === "withheld_or_not_shared") {
    return `${reportTopicLabel(report.topic)} may be withheld or vague`;
  }
  return reportTopicLabel(report.topic);
}

function reportItemMeaning(
  report: WordOfMouthReport,
  status: SocialDiffusionStatus,
  tacit: SocialDiffusionTacitDifficulty,
): string {
  if (status === "tested_locally") {
    return "A report has local checking behind it, but this still does not become a learned practice.";
  }
  if (status === "rejected_as_untrusted") {
    return "The contact or report is not trusted enough to become a practical guide.";
  }
  if (status === "withheld_or_not_shared") {
    return "Contact may be cautious or source-biased; no sharing strategy is implemented.";
  }
  if (tacit === "high") {
    return "The result can be heard or seen, but the practical steps are hard to copy.";
  }
  return "The band has exposure to the idea, not reliable local knowledge.";
}

function sourceLabelForReport(report: WordOfMouthReport): string {
  if (report.trustBasis === "parent") return "parent band";
  if (report.trustBasis === "daughter") return "daughter band";
  if (report.trustBasis === "sibling") return "sibling band";
  if (report.trustBasis === "lineage_kin") return "lineage kin";
  if (report.trustBasis === "familiar_neighbor" || report.trustBasis === "repeated_contact") return "known neighbour";
  if (report.trustBasis === "stranger" || report.trustBasis === "weak_contact") return "weak contact";
  return report.trustBasis.replace(/_/g, " ");
}

function reportTopicLabel(topic: ReportedKnowledgeTopic): string {
  return topic.replace(/_/g, " ");
}

function socialDiffusionTitle(
  contexts: readonly SocialEcologicalContext[],
  items: readonly SocialDiffusionItem[],
): string {
  const heard = items.filter((item) => item.visibility === "heard").length;
  const trace = items.filter((item) => item.visibility === "trace" || item.visibility === "seen").length;
  if (heard > 0) {
    return `${heard} social knowledge hook${heard === 1 ? "" : "s"} reach the band`;
  }
  if (trace > 0) {
    return "Visible traces are the main social evidence";
  }
  if (contexts.length > 0) {
    return "The social landscape is present but weak";
  }
  return "Little inter-band knowledge reaches them";
}

function socialDiffusionLines(
  contexts: readonly SocialEcologicalContext[],
  items: readonly SocialDiffusionItem[],
): readonly string[] {
  if (contexts.length === 0 && items.length === 0) {
    return ["No grounded contact, report, inherited, or trace-based diffusion hook is visible yet."];
  }
  const tacit = items.filter((item) => item.risks.includes("missing_tacit_steps")).length;
  const cautious = items.filter((item) =>
    item.trustFilter === "cautious_hearsay" ||
    item.trustFilter === "tense_contact" ||
    item.status === "withheld_or_not_shared" ||
    item.status === "rejected_as_untrusted").length;
  return [
    `${contexts.length} social context signal${contexts.length === 1 ? "" : "s"} and ${items.length} diffusion hook${items.length === 1 ? "" : "s"} are visible.`,
    `${tacit} carry missing-tacit-step risk; ${cautious} are filtered by caution, distrust, or possible withholding.`,
    "Exposure from other bands or traces is not a learned skill, territory, trade, or culture.",
  ];
}

function byteLengthUtf8(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

function maxJsonBytes(values: readonly unknown[]): number {
  return Math.max(0, ...values.map((value) => byteLengthUtf8(value)));
}

function clamp01(value: number): NormalizedIntensity {
  return Math.max(0, Math.min(1, value)) as NormalizedIntensity;
}

export function socialDiffusionChannelLabel(channel: SocialDiffusionChannel): string {
  switch (channel) {
    case "direct_contact":
      return "Direct contact";
    case "activity_talk":
      return "Camp talk";
    case "visible_trace":
      return "Visible trace";
    case "old_camp_trace":
      return "Old camp trace";
    case "parent_daughter":
      return "Parent/daughter";
    case "shared_route_water_country":
      return "Shared country";
  }
}

export function socialDiffusionDomainLabel(domain: SocialDiffusionDomain): string {
  switch (domain) {
    case "route_crossing":
      return "Route / crossing";
    case "food_work":
      return "Food work";
    case "camp_foothold_care":
      return "Camp / care";
    case "material_affordance":
      return "Material possibility";
    case "fire_hearth_fuel":
      return "Fire / fuel";
    case "water_edge":
      return "Water edge";
    case "social_contact":
      return "Social contact";
  }
}

export function socialDiffusionStatusLabel(status: SocialDiffusionStatus): string {
  switch (status) {
    case "heard_not_practiced":
      return "heard, not practiced";
    case "seen_not_understood":
      return "seen, not understood";
    case "visible_trace_only":
      return "trace only";
    case "copied_superficially":
      return "surface copy";
    case "partial_copy":
      return "partial copy";
    case "rejected_as_untrusted":
      return "not trusted";
    case "withheld_or_not_shared":
      return "may not be shared";
    case "inherited_story":
      return "inherited story";
    case "inherited_practical_hint":
      return "inherited hint";
    case "tested_locally":
      return "locally checked";
    case "blocked_by_material_context":
      return "material mismatch";
    case "blocked_by_labor":
      return "labor blocked";
    case "local_only":
      return "local only";
    case "false_confidence_risk":
      return "false-confidence risk";
    case "dead_end_risk":
      return "dead-end risk";
    case "compatible_but_untried":
      return "compatible, untried";
    case "diffusion_ready_later":
      return "diffusion-ready later";
  }
}

export function socialDiffusionTacitDifficultyLabel(difficulty: SocialDiffusionTacitDifficulty): string {
  switch (difficulty) {
    case "low":
      return "low tacit difficulty";
    case "medium":
      return "some tacit steps";
    case "high":
      return "hard to copy";
    case "unknown":
      return "unknown tacit difficulty";
  }
}

export function socialDiffusionCompatibilityLabel(compatibility: SocialDiffusionCompatibility): string {
  switch (compatibility) {
    case "compatible":
      return "compatible here";
    case "weakly_compatible":
      return "weakly compatible";
    case "mismatched_material":
      return "material mismatch";
    case "mismatched_place":
      return "place mismatch";
    case "not_enough_labor":
      return "labor too thin";
    case "inherited_from_different_country":
      return "from different country";
    case "unknown_compatibility":
      return "compatibility unknown";
  }
}

export function socialDiffusionTrustFilterLabel(trust: SocialDiffusionTrustFilter): string {
  switch (trust) {
    case "trusted_enough_to_hear":
      return "trusted enough to hear";
    case "cautious_hearsay":
      return "cautious hearsay";
    case "avoids_source":
      return "avoids source";
    case "source_unknown":
      return "source unknown";
    case "inherited_caution":
      return "inherited caution";
    case "friendly_contact":
      return "friendly contact";
    case "tense_contact":
      return "tense contact";
    case "no_social_basis":
      return "no social basis";
  }
}
