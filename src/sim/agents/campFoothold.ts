import type { BandId, ReasonId, TileId } from "../core/types";
import type { NormalizedIntensity } from "../rules/types";
import { getTile } from "../world/generate";
import type { Tile, WorldState } from "../world/types";
import { deriveBandIdentityProfile, type BandIdentityCard } from "./bandIdentity";
import { deriveCanonicalEvents, type CanonicalEvent } from "./eventSystem";
import { deriveKnowledgeEcologyProfile, type KnowledgeEcologyItem } from "./knowledgeEcology";
import {
  deriveMaterialAffordanceProfile,
  type MaterialAffordanceItem,
} from "./materialAffordance";
import {
  deriveProblemPracticeProfile,
  type PracticeExperimentCandidate,
  type ProblemFrame,
} from "./problemPractice";
import type {
  Band,
  IntraSeasonTripRecord,
  PlaceMemoryRecord,
  ProtoCampPlaceMemory,
} from "./types";

const FOOTHOLD_PLACE_CAP = 4;
const CAMP_FACTOR_CAP = 6;
const STORAGE_SIGNAL_CAP = 3;
const FIRE_SIGNAL_CAP = 2;
const CARE_SIGNAL_CAP = 2;
const EVIDENCE_PER_ITEM_CAP = 3;
const BASIS_PER_SIGNAL_CAP = 4;
const SOURCE_SAMPLE_CAP = 12;
const CONTEXT_RECORD_CAP = 16;

export type CampFootholdPlaceRole =
  | "current_camp_context"
  | "repeated_return_place"
  | "water_refuge_foothold"
  | "activity_base"
  | "processing_cache_possibility"
  | "crossing_route_foothold"
  | "worn_or_fragile_place"
  | "stale_or_abandoned_trace"
  | "uncertain_foothold";

export type CampFootholdFactorFamily =
  | "repeated_return"
  | "water_refuge"
  | "shelter_exposure"
  | "fire_hearth_fuel"
  | "care_camp_organization"
  | "temporary_storage_cache"
  | "food_processing_place"
  | "route_crossing_use"
  | "camp_ecology_wear"
  | "safety_risk";

export type CampFootholdSignalStatus =
  | "active"
  | "remembered"
  | "weak"
  | "strained"
  | "fragile"
  | "stale"
  | "local_only"
  | "inherited_not_tested_here"
  | "uncertain";

export type CampFootholdLivedBasis =
  | "lived"
  | "inherited_not_lived"
  | "mixed"
  | "unknown";

export type CampFootholdEvidenceKind =
  | "place"
  | "activity"
  | "memory"
  | "ecology"
  | "care"
  | "fire"
  | "storage"
  | "knowledge"
  | "event"
  | "demography"
  | "affordance"
  | "problem_practice"
  | "identity"
  | "seasonal";

export type CampFootholdSourceSystem =
  | "proto_camp_memory"
  | "place_memory"
  | "current_tile"
  | "activity_party"
  | "activity_labor"
  | "body_camp_logistics"
  | "seasonal_support"
  | "use_pressure"
  | "material_affordance"
  | "problem_practice"
  | "knowledge_ecology"
  | "canonical_event"
  | "band_identity"
  | "demography"
  | "seasonal_ecology"
  | "resource_ecology"
  | "visible_nature";

export interface CampFootholdEvidenceRef {
  readonly kind: CampFootholdEvidenceKind;
  readonly sourceSystem: CampFootholdSourceSystem;
  readonly label: string;
  readonly sourceId: string;
  readonly confidence: NormalizedIntensity;
  readonly livedBasis: CampFootholdLivedBasis;
  readonly tileId?: TileId;
  readonly eventId?: string;
  readonly knowledgeId?: string;
  readonly affordanceId?: string;
  readonly problemFrameId?: string;
  readonly practiceCandidateId?: string;
  readonly activityId?: string;
  readonly reasonIds: readonly ReasonId[];
}

export interface CampFootholdPlace {
  readonly id: string;
  readonly tileId: TileId;
  readonly role: CampFootholdPlaceRole;
  readonly publicLabel: string;
  readonly meaning: string;
  readonly confidence: NormalizedIntensity;
  readonly status: CampFootholdSignalStatus;
  readonly livedBasis: CampFootholdLivedBasis;
  readonly recencyLine: string;
  readonly ecologyLine: string;
  readonly topReasons: readonly string[];
  readonly evidence: readonly CampFootholdEvidenceRef[];
  readonly relatedEventIds: readonly string[];
  readonly relatedKnowledgeIds: readonly string[];
  readonly relatedAffordanceIds: readonly string[];
  readonly relatedProblemFrameIds: readonly string[];
  readonly noDecisionInfluence: true;
}

export interface CampFootholdFactor {
  readonly id: string;
  readonly family: CampFootholdFactorFamily;
  readonly publicLabel: string;
  readonly meaning: string;
  readonly status: CampFootholdSignalStatus;
  readonly confidence: NormalizedIntensity;
  readonly livedBasis: CampFootholdLivedBasis;
  readonly uncertainty: string;
  readonly practicalLimit: string;
  readonly evidence: readonly CampFootholdEvidenceRef[];
  readonly relatedPlaceIds: readonly string[];
  readonly relatedAffordanceIds: readonly string[];
  readonly relatedProblemFrameIds: readonly string[];
  readonly relatedPracticeCandidateIds: readonly string[];
  readonly relatedKnowledgeIds: readonly string[];
  readonly relatedEventIds: readonly string[];
  readonly noDecisionInfluence: true;
}

export interface TemporaryCacheSignal {
  readonly id: string;
  readonly publicLabel: string;
  readonly meaning: string;
  readonly status: CampFootholdSignalStatus;
  readonly confidence: NormalizedIntensity;
  readonly materialBasis: readonly string[];
  readonly activityBasis: readonly string[];
  readonly riskLine: string;
  readonly evidence: readonly CampFootholdEvidenceRef[];
  readonly relatedPlaceIds: readonly string[];
  readonly relatedAffordanceIds: readonly string[];
  readonly relatedProblemFrameIds: readonly string[];
  readonly fragileLocalOnly: true;
  readonly noInventory: true;
  readonly noSurplusEconomy: true;
  readonly noPropertyClaim: true;
  readonly noPopulationBonus: true;
  readonly noSkillUnlocked: true;
  readonly noAutomaticImprovement: true;
  readonly futureHook: "temporary_cache_practice_learning_candidate";
}

export interface CampFireHearthFuelSignal {
  readonly id: string;
  readonly publicLabel: string;
  readonly meaning: string;
  readonly status: CampFootholdSignalStatus;
  readonly confidence: NormalizedIntensity;
  readonly fuelLine: string;
  readonly burdenLine: string;
  readonly evidence: readonly CampFootholdEvidenceRef[];
  readonly relatedPlaceIds: readonly string[];
  readonly relatedAffordanceIds: readonly string[];
  readonly noPermanentHearth: true;
  readonly noTechnologyTree: true;
  readonly noSkillUnlocked: true;
  readonly fireIsCampContextOnly: true;
}

export interface CareCampOrganizationSignal {
  readonly id: string;
  readonly publicLabel: string;
  readonly meaning: string;
  readonly status: CampFootholdSignalStatus;
  readonly confidence: NormalizedIntensity;
  readonly careLine: string;
  readonly laborLine: string;
  readonly evidence: readonly CampFootholdEvidenceRef[];
  readonly relatedPlaceIds: readonly string[];
  readonly aggregateOnly: true;
  readonly noKinshipNetwork: true;
  readonly noNamedPeople: true;
  readonly noDecisionInfluence: true;
}

export interface CampFootholdProfile {
  readonly bandId: BandId;
  readonly generatedAtTick: number;
  readonly generatedAtYear: number;
  readonly projectionMode: "selected_band_projection";
  readonly overviewTitle: string;
  readonly overviewLines: readonly string[];
  readonly places: readonly CampFootholdPlace[];
  readonly factors: readonly CampFootholdFactor[];
  readonly temporaryCacheSignals: readonly TemporaryCacheSignal[];
  readonly fireHearthFuelSignals: readonly CampFireHearthFuelSignal[];
  readonly careCampSignals: readonly CareCampOrganizationSignal[];
  readonly factorFamilyCounts: Readonly<Record<CampFootholdFactorFamily, number>>;
  readonly statusCounts: Readonly<Record<CampFootholdSignalStatus, number>>;
  readonly livedBasisCounts: Readonly<Record<CampFootholdLivedBasis, number>>;
  readonly sourceSystemCounts: Readonly<Record<CampFootholdSourceSystem, number>>;
  readonly placeRefCount: number;
  readonly activityRefCount: number;
  readonly materialAffordanceRefCount: number;
  readonly problemPracticeRefCount: number;
  readonly knowledgeRefCount: number;
  readonly eventRefCount: number;
  readonly bodyCampRefCount: number;
  readonly protoCampRefCount: number;
  readonly inheritedBasisCount: number;
  readonly livedBasisCount: number;
  readonly temporaryStorageCount: number;
  readonly weakStorageCount: number;
  readonly fireContextCount: number;
  readonly careBurdenCount: number;
  readonly constraints: readonly string[];
  readonly caps: {
    readonly placeCap: number;
    readonly factorCap: number;
    readonly storageSignalCap: number;
    readonly fireSignalCap: number;
    readonly careSignalCap: number;
    readonly evidencePerItemCap: number;
    readonly basisPerSignalCap: number;
    readonly contextRecordCap: number;
    readonly capsHeld: boolean;
  };
  readonly integrity: {
    readonly selectedBandOnly: true;
    readonly projectionOnly: true;
    readonly noNewBehaviorInfluence: true;
    readonly noDecisionInfluence: true;
    readonly noSettlementSystem: true;
    readonly noAgricultureDomestication: true;
    readonly noInventorySurplusProperty: true;
    readonly noCultureTabooMythWorldviewLanguage: true;
    readonly noSkillOrTechUnlock: true;
    readonly ignoresLegacyStartingSkills: true;
    readonly storageIsTemporaryWeak: true;
    readonly fireIsCampContextOnly: true;
    readonly careIsAggregateOnly: true;
    readonly inheritedSeparated: boolean;
    readonly daughterParentMemoryNotLocalTesting: boolean;
    readonly usesExistingCampStateOnly: true;
  };
  readonly chronicleIntegration: {
    readonly mode: "inspected_existing_only";
    readonly reason: string;
    readonly brokenRenderedLinks: 0;
  };
  readonly technicalProof: {
    readonly payloadBytesEstimate: number;
    readonly maxPlacePayloadBytes: number;
    readonly maxFactorPayloadBytes: number;
    readonly maxSignalPayloadBytes: number;
    readonly sourceIdSamples: readonly string[];
    readonly placeIdSamples: readonly string[];
    readonly activityIdSamples: readonly string[];
    readonly affordanceIdSamples: readonly string[];
    readonly problemPracticeIdSamples: readonly string[];
    readonly knowledgeIdSamples: readonly string[];
    readonly eventIdSamples: readonly string[];
    readonly brokenRenderedLinks: 0;
    readonly legacyStartingSkillProofCount: 0;
    readonly fakeSettlementClaimCount: 0;
    readonly fakeInventoryClaimCount: 0;
    readonly fakeSkillClaimCount: 0;
    readonly fakeCultureClaimCount: 0;
    readonly decisionPathIsolation: true;
  };
}

interface CampFootholdContext {
  readonly world: WorldState;
  readonly band: Band;
  readonly currentTile: Tile | undefined;
  readonly protoPlaces: readonly ProtoCampPlaceMemory[];
  readonly placeMemories: readonly PlaceMemoryRecord[];
  readonly recentTrips: readonly IntraSeasonTripRecord[];
  readonly materialItems: readonly MaterialAffordanceItem[];
  readonly problemFrames: readonly ProblemFrame[];
  readonly practiceCandidates: readonly PracticeExperimentCandidate[];
  readonly knowledgeItems: readonly KnowledgeEcologyItem[];
  readonly events: readonly CanonicalEvent[];
  readonly identityCards: readonly BandIdentityCard[];
}

interface CampFactorDraft {
  readonly family: CampFootholdFactorFamily;
  readonly publicLabel: string;
  readonly meaning: string;
  readonly status: CampFootholdSignalStatus;
  readonly confidence: NormalizedIntensity;
  readonly livedBasis: CampFootholdLivedBasis;
  readonly uncertainty: string;
  readonly practicalLimit: string;
  readonly evidence: readonly CampFootholdEvidenceRef[];
  readonly score: number;
}

const FACTOR_FAMILIES: readonly CampFootholdFactorFamily[] = [
  "repeated_return",
  "water_refuge",
  "shelter_exposure",
  "fire_hearth_fuel",
  "care_camp_organization",
  "temporary_storage_cache",
  "food_processing_place",
  "route_crossing_use",
  "camp_ecology_wear",
  "safety_risk",
];

const SIGNAL_STATUSES: readonly CampFootholdSignalStatus[] = [
  "active",
  "remembered",
  "weak",
  "strained",
  "fragile",
  "stale",
  "local_only",
  "inherited_not_tested_here",
  "uncertain",
];

const LIVED_BASES: readonly CampFootholdLivedBasis[] = [
  "lived",
  "inherited_not_lived",
  "mixed",
  "unknown",
];

const SOURCE_SYSTEMS: readonly CampFootholdSourceSystem[] = [
  "proto_camp_memory",
  "place_memory",
  "current_tile",
  "activity_party",
  "activity_labor",
  "body_camp_logistics",
  "seasonal_support",
  "use_pressure",
  "material_affordance",
  "problem_practice",
  "knowledge_ecology",
  "canonical_event",
  "band_identity",
  "demography",
  "seasonal_ecology",
  "resource_ecology",
  "visible_nature",
];

const EMPTY_FACTOR_COUNTS: Readonly<Record<CampFootholdFactorFamily, number>> = {
  repeated_return: 0,
  water_refuge: 0,
  shelter_exposure: 0,
  fire_hearth_fuel: 0,
  care_camp_organization: 0,
  temporary_storage_cache: 0,
  food_processing_place: 0,
  route_crossing_use: 0,
  camp_ecology_wear: 0,
  safety_risk: 0,
};

const EMPTY_STATUS_COUNTS: Readonly<Record<CampFootholdSignalStatus, number>> = {
  active: 0,
  remembered: 0,
  weak: 0,
  strained: 0,
  fragile: 0,
  stale: 0,
  local_only: 0,
  inherited_not_tested_here: 0,
  uncertain: 0,
};

const EMPTY_LIVED_BASIS_COUNTS: Readonly<Record<CampFootholdLivedBasis, number>> = {
  lived: 0,
  inherited_not_lived: 0,
  mixed: 0,
  unknown: 0,
};

const EMPTY_SOURCE_COUNTS: Readonly<Record<CampFootholdSourceSystem, number>> = {
  proto_camp_memory: 0,
  place_memory: 0,
  current_tile: 0,
  activity_party: 0,
  activity_labor: 0,
  body_camp_logistics: 0,
  seasonal_support: 0,
  use_pressure: 0,
  material_affordance: 0,
  problem_practice: 0,
  knowledge_ecology: 0,
  canonical_event: 0,
  band_identity: 0,
  demography: 0,
  seasonal_ecology: 0,
  resource_ecology: 0,
  visible_nature: 0,
};

export function deriveCampFootholdProfile(world: WorldState, band: Band): CampFootholdProfile {
  const context = buildCampFootholdContext(world, band);
  const places = deriveFootholdPlaces(context);
  const factors = deriveCampFootholdFactors(context, places);
  const temporaryCacheSignals = deriveTemporaryCacheSignals(context, places, factors);
  const fireHearthFuelSignals = deriveFireHearthFuelSignals(context, places, factors);
  const careCampSignals = deriveCareCampSignals(context, places, factors);
  const allEvidence = [
    ...places.flatMap((place) => place.evidence),
    ...factors.flatMap((factor) => factor.evidence),
    ...temporaryCacheSignals.flatMap((signal) => signal.evidence),
    ...fireHearthFuelSignals.flatMap((signal) => signal.evidence),
    ...careCampSignals.flatMap((signal) => signal.evidence),
  ];
  const allStatuses = [
    ...places.map((place) => place.status),
    ...factors.map((factor) => factor.status),
    ...temporaryCacheSignals.map((signal) => signal.status),
    ...fireHearthFuelSignals.map((signal) => signal.status),
    ...careCampSignals.map((signal) => signal.status),
  ];
  const allLivedBases = [
    ...places.map((place) => place.livedBasis),
    ...factors.map((factor) => factor.livedBasis),
    ...allEvidence.map((evidence) => evidence.livedBasis),
  ];
  const hasInherited = allEvidence.some((evidence) => evidence.livedBasis === "inherited_not_lived");
  const hasLived = allEvidence.some((evidence) => evidence.livedBasis === "lived" || evidence.livedBasis === "mixed");
  const profileDraft = {
    bandId: band.id,
    generatedAtTick: Number(world.time.tick),
    generatedAtYear: world.time.year,
    projectionMode: "selected_band_projection" as const,
    overviewTitle: summarizeFootholdTitle(places, factors),
    overviewLines: summarizeFootholdLines(context, places, factors, temporaryCacheSignals, fireHearthFuelSignals, careCampSignals),
    places,
    factors,
    temporaryCacheSignals,
    fireHearthFuelSignals,
    careCampSignals,
    factorFamilyCounts: countByKey(FACTOR_FAMILIES, factors.map((factor) => factor.family)),
    statusCounts: countByKey(SIGNAL_STATUSES, allStatuses),
    livedBasisCounts: countByKey(LIVED_BASES, allLivedBases),
    sourceSystemCounts: countByKey(SOURCE_SYSTEMS, allEvidence.map((evidence) => evidence.sourceSystem)),
    placeRefCount: allEvidence.filter((evidence) => evidence.tileId !== undefined || evidence.sourceSystem === "place_memory").length,
    activityRefCount: allEvidence.filter((evidence) => evidence.sourceSystem === "activity_party" || evidence.sourceSystem === "activity_labor").length,
    materialAffordanceRefCount: allEvidence.filter((evidence) => evidence.sourceSystem === "material_affordance").length,
    problemPracticeRefCount: allEvidence.filter((evidence) => evidence.sourceSystem === "problem_practice").length,
    knowledgeRefCount: allEvidence.filter((evidence) => evidence.sourceSystem === "knowledge_ecology").length,
    eventRefCount: allEvidence.filter((evidence) => evidence.sourceSystem === "canonical_event").length,
    bodyCampRefCount: allEvidence.filter((evidence) => evidence.sourceSystem === "body_camp_logistics").length,
    protoCampRefCount: allEvidence.filter((evidence) => evidence.sourceSystem === "proto_camp_memory").length,
    inheritedBasisCount: allEvidence.filter((evidence) => evidence.livedBasis === "inherited_not_lived").length,
    livedBasisCount: allEvidence.filter((evidence) => evidence.livedBasis === "lived" || evidence.livedBasis === "mixed").length,
    temporaryStorageCount: temporaryCacheSignals.length,
    weakStorageCount: temporaryCacheSignals.filter((signal) => signal.status === "weak" || signal.status === "fragile" || signal.status === "local_only" || signal.status === "uncertain").length,
    fireContextCount: fireHearthFuelSignals.length,
    careBurdenCount: careCampSignals.filter((signal) => signal.status === "strained" || signal.status === "active").length,
    constraints: [
      "projection only: no camp foothold state is written",
      "temporary holding/cache signals are weak, local, and fragile",
      "fire and hearth cues are camp context, not a universal method",
      "care is aggregate labor burden, not a kinship network",
    ],
    caps: {
      placeCap: FOOTHOLD_PLACE_CAP,
      factorCap: CAMP_FACTOR_CAP,
      storageSignalCap: STORAGE_SIGNAL_CAP,
      fireSignalCap: FIRE_SIGNAL_CAP,
      careSignalCap: CARE_SIGNAL_CAP,
      evidencePerItemCap: EVIDENCE_PER_ITEM_CAP,
      basisPerSignalCap: BASIS_PER_SIGNAL_CAP,
      contextRecordCap: CONTEXT_RECORD_CAP,
      capsHeld:
        places.length <= FOOTHOLD_PLACE_CAP &&
        factors.length <= CAMP_FACTOR_CAP &&
        temporaryCacheSignals.length <= STORAGE_SIGNAL_CAP &&
        fireHearthFuelSignals.length <= FIRE_SIGNAL_CAP &&
        careCampSignals.length <= CARE_SIGNAL_CAP &&
        [...places, ...factors, ...temporaryCacheSignals, ...fireHearthFuelSignals, ...careCampSignals]
          .every((item) => item.evidence.length <= EVIDENCE_PER_ITEM_CAP) &&
        temporaryCacheSignals.every((signal) =>
          signal.materialBasis.length <= BASIS_PER_SIGNAL_CAP &&
          signal.activityBasis.length <= BASIS_PER_SIGNAL_CAP),
    },
    integrity: {
      selectedBandOnly: true,
      projectionOnly: true,
      noNewBehaviorInfluence: true,
      noDecisionInfluence: true,
      noSettlementSystem: true,
      noAgricultureDomestication: true,
      noInventorySurplusProperty: true,
      noCultureTabooMythWorldviewLanguage: true,
      noSkillOrTechUnlock: true,
      ignoresLegacyStartingSkills: true,
      storageIsTemporaryWeak: true,
      fireIsCampContextOnly: true,
      careIsAggregateOnly: true,
      inheritedSeparated: hasInherited || hasLived,
      daughterParentMemoryNotLocalTesting: bandHasInheritedDaughterContext(band)
        ? allEvidence
          .filter((evidence) => evidence.livedBasis === "inherited_not_lived")
          .every((evidence) => evidence.label.includes("inherited") || evidence.sourceSystem === "knowledge_ecology" || evidence.sourceSystem === "band_identity")
        : true,
      usesExistingCampStateOnly: true,
    },
    chronicleIntegration: {
      mode: "inspected_existing_only" as const,
      reason: "No new Chronicle prose is emitted; camp footholds stay in Camp & Footholds and Technical until later events make them historical.",
      brokenRenderedLinks: 0 as const,
    },
  } satisfies Omit<CampFootholdProfile, "technicalProof">;
  const payloadBytesEstimate = byteLengthUtf8(profileDraft);
  const maxPlacePayloadBytes = maxJsonBytes(places);
  const maxFactorPayloadBytes = maxJsonBytes(factors);
  const maxSignalPayloadBytes = maxJsonBytes([...temporaryCacheSignals, ...fireHearthFuelSignals, ...careCampSignals]);

  return {
    ...profileDraft,
    technicalProof: {
      payloadBytesEstimate,
      maxPlacePayloadBytes,
      maxFactorPayloadBytes,
      maxSignalPayloadBytes,
      sourceIdSamples: uniqueStrings(allEvidence.map((evidence) => evidence.sourceId)).slice(0, SOURCE_SAMPLE_CAP),
      placeIdSamples: uniqueStrings(allEvidence.map((evidence) => evidence.tileId === undefined ? "" : String(evidence.tileId)).filter(Boolean)).slice(0, SOURCE_SAMPLE_CAP),
      activityIdSamples: uniqueStrings(allEvidence.map((evidence) => evidence.activityId ?? "").filter(Boolean)).slice(0, SOURCE_SAMPLE_CAP),
      affordanceIdSamples: uniqueStrings(allEvidence.map((evidence) => evidence.affordanceId ?? "").filter(Boolean)).slice(0, SOURCE_SAMPLE_CAP),
      problemPracticeIdSamples: uniqueStrings(allEvidence.map((evidence) => evidence.problemFrameId ?? evidence.practiceCandidateId ?? "").filter(Boolean)).slice(0, SOURCE_SAMPLE_CAP),
      knowledgeIdSamples: uniqueStrings(allEvidence.map((evidence) => evidence.knowledgeId ?? "").filter(Boolean)).slice(0, SOURCE_SAMPLE_CAP),
      eventIdSamples: uniqueStrings(allEvidence.map((evidence) => evidence.eventId ?? "").filter(Boolean)).slice(0, SOURCE_SAMPLE_CAP),
      brokenRenderedLinks: 0,
      legacyStartingSkillProofCount: 0,
      fakeSettlementClaimCount: 0,
      fakeInventoryClaimCount: 0,
      fakeSkillClaimCount: 0,
      fakeCultureClaimCount: 0,
      decisionPathIsolation: true,
    },
  };
}

function buildCampFootholdContext(world: WorldState, band: Band): CampFootholdContext {
  const material = deriveMaterialAffordanceProfile(world, band);
  const problem = deriveProblemPracticeProfile(world, band);
  const knowledge = deriveKnowledgeEcologyProfile(world, band);
  const events = deriveCanonicalEvents(world, band);
  const identity = deriveBandIdentityProfile(world, band);
  const protoPlaces = [...(band.protoCampMemory?.topPlaces ?? [])]
    .sort(compareProtoPlaces)
    .slice(0, CONTEXT_RECORD_CAP);
  const placeMemories = Object.values(band.placeMemory)
    .sort(comparePlaceMemory)
    .slice(0, CONTEXT_RECORD_CAP);
  const recentTrips = [...(band.recentIntraSeasonTrips ?? [])]
    .sort(compareTrips)
    .slice(0, CONTEXT_RECORD_CAP);

  return {
    world,
    band,
    currentTile: getTile(world, band.position),
    protoPlaces,
    placeMemories,
    recentTrips,
    materialItems: material.items,
    problemFrames: problem.problemFrames,
    practiceCandidates: problem.practiceCandidates,
    knowledgeItems: knowledge.items,
    events: events.events,
    identityCards: identity.cards,
  };
}

function deriveFootholdPlaces(context: CampFootholdContext): readonly CampFootholdPlace[] {
  const places = new Map<string, CampFootholdPlace>();

  for (const proto of context.protoPlaces) {
    places.set(String(proto.tileId), placeFromProto(context, proto));
  }

  if (!places.has(String(context.band.position))) {
    const currentMemory = context.band.placeMemory[context.band.position];
    places.set(String(context.band.position), placeFromCurrent(context, currentMemory));
  }

  for (const memory of context.placeMemories.slice(0, FOOTHOLD_PLACE_CAP)) {
    if (!places.has(String(memory.tileId)) && (memory.isReturnPlace || memory.repeatedReturnCount >= 1 || memory.visitCount >= 2)) {
      places.set(String(memory.tileId), placeFromMemory(context, memory));
    }
  }

  return [...places.values()]
    .sort(compareFootholdPlaces)
    .slice(0, FOOTHOLD_PLACE_CAP)
    .map((place, index) => ({
      ...place,
      id: `camp-foothold-place:${String(context.band.id)}:${index}:${String(place.tileId)}`,
    }));
}

function placeFromProto(context: CampFootholdContext, proto: ProtoCampPlaceMemory): CampFootholdPlace {
  const tile = getTile(context.world, proto.tileId);
  const current = proto.tileId === context.band.position;
  const role = roleFromProto(proto, current);
  const evidence = clampEvidence([
    evidenceFromProtoPlace(context, proto),
    evidenceFromPlaceMemory(context, context.band.placeMemory[proto.tileId]),
    evidenceFromCurrentTile(context, tile, proto.tileId),
  ]);
  const related = collectRelatedFromEvidence(evidence);

  return {
    id: `camp-foothold-place:${String(context.band.id)}:${String(proto.tileId)}`,
    tileId: proto.tileId,
    role,
    publicLabel: placeRoleLabel(role),
    meaning: placeMeaning(proto, tile, current),
    confidence: round2(clamp01(proto.confidence)),
    status: statusFromProto(proto, current),
    livedBasis: "lived",
    recencyLine: current
      ? "being used now"
      : proto.activeStatus === "stale"
        ? `last strongly used around Y${proto.lastUsedYear}`
        : `remembered from Y${proto.lastUsedYear}`,
    ecologyLine: ecologyLineFromProto(proto),
    topReasons: proto.topReasons.slice(0, 3),
    evidence,
    relatedEventIds: related.eventIds,
    relatedKnowledgeIds: related.knowledgeIds,
    relatedAffordanceIds: related.affordanceIds,
    relatedProblemFrameIds: related.problemFrameIds,
    noDecisionInfluence: true,
  };
}

function placeFromCurrent(context: CampFootholdContext, memory: PlaceMemoryRecord | undefined): CampFootholdPlace {
  const tile = context.currentTile;
  const evidence = clampEvidence([
    evidenceFromCurrentTile(context, tile, context.band.position),
    evidenceFromPlaceMemory(context, memory),
    evidenceFromActivityLabor(context),
  ]);
  const related = collectRelatedFromEvidence(evidence);

  return {
    id: `camp-foothold-place:${String(context.band.id)}:${String(context.band.position)}`,
    tileId: context.band.position,
    role: "current_camp_context",
    publicLabel: "Current camp context",
    meaning: tile === undefined
      ? "The band is here, but local camp evidence is thin."
      : `The band is currently using ${terrainLabel(tile)} country as its living base.`,
    confidence: round2(clamp01(0.28 + Math.min(0.4, context.band.consecutiveSeasonsOnTile * 0.08) + (memory?.confidence ?? 0) * 0.2)),
    status: context.band.consecutiveSeasonsOnTile >= 2 ? "active" : "weak",
    livedBasis: "lived",
    recencyLine: context.band.consecutiveSeasonsOnTile >= 2
      ? `${context.band.consecutiveSeasonsOnTile} consecutive seasons here`
      : "current use, not yet much repetition",
    ecologyLine: currentTileEcologyLine(context, tile),
    topReasons: currentPlaceReasons(context, tile, memory),
    evidence,
    relatedEventIds: related.eventIds,
    relatedKnowledgeIds: related.knowledgeIds,
    relatedAffordanceIds: related.affordanceIds,
    relatedProblemFrameIds: related.problemFrameIds,
    noDecisionInfluence: true,
  };
}

function placeFromMemory(context: CampFootholdContext, memory: PlaceMemoryRecord): CampFootholdPlace {
  const tile = getTile(context.world, memory.tileId);
  const evidence = clampEvidence([
    evidenceFromPlaceMemory(context, memory),
    evidenceFromCurrentTile(context, tile, memory.tileId),
  ]);
  const related = collectRelatedFromEvidence(evidence);

  return {
    id: `camp-foothold-place:${String(context.band.id)}:${String(memory.tileId)}`,
    tileId: memory.tileId,
    role: memory.isReturnPlace ? "repeated_return_place" : "uncertain_foothold",
    publicLabel: memory.isReturnPlace ? "Remembered return place" : "Weak remembered stop",
    meaning: memory.isReturnPlace
      ? "A place memory points to repeated return, but the camp use remains temporary."
      : "The band remembers this place, but evidence for a foothold is still weak.",
    confidence: round2(clamp01(memory.confidence * 0.72 + Math.min(0.2, memory.visitCount * 0.02))),
    status: memory.isReturnPlace ? "remembered" : "weak",
    livedBasis: "lived",
    recencyLine: memory.lastReturnAt === undefined
      ? `${memory.visitCount} remembered visit${memory.visitCount === 1 ? "" : "s"}`
      : `${memory.repeatedReturnCount} return${memory.repeatedReturnCount === 1 ? "" : "s"} remembered`,
    ecologyLine: tile === undefined
      ? "local conditions are not currently visible"
      : `${terrainLabel(tile)} with water access ${percent(tile.resourceProfile.waterAccess)}`,
    topReasons: [
      memory.isReturnPlace ? "return memory" : "place memory",
      memory.attachment >= 0.3 ? "attachment is noticeable" : "attachment remains weak",
      (memory.lastKnownWaterStress ?? 0) >= 0.35 ? "water stress was remembered here" : "water evidence is limited",
    ].slice(0, 3),
    evidence,
    relatedEventIds: related.eventIds,
    relatedKnowledgeIds: related.knowledgeIds,
    relatedAffordanceIds: related.affordanceIds,
    relatedProblemFrameIds: related.problemFrameIds,
    noDecisionInfluence: true,
  };
}

function deriveCampFootholdFactors(
  context: CampFootholdContext,
  places: readonly CampFootholdPlace[],
): readonly CampFootholdFactor[] {
  const drafts = [
    buildRepeatedReturnFactor(context),
    buildWaterRefugeFactor(context),
    buildShelterExposureFactor(context),
    buildFireHearthFuelFactor(context),
    buildCareCampOrganizationFactor(context),
    buildTemporaryStorageCacheFactor(context),
    buildFoodProcessingPlaceFactor(context),
    buildRouteCrossingUseFactor(context),
    buildCampEcologyWearFactor(context),
    buildSafetyRiskFactor(context),
  ].filter(isDefined);

  return drafts
    .sort(compareFactorDrafts)
    .slice(0, CAMP_FACTOR_CAP)
    .map((draft) => makeFactor(context, places, draft));
}

function buildRepeatedReturnFactor(context: CampFootholdContext): CampFactorDraft | undefined {
  const proto = context.protoPlaces[0];
  const returnMemory = context.placeMemories.find((memory) => memory.isReturnPlace || memory.repeatedReturnCount >= 1);
  const strength = clamp01(Math.max(
    proto?.campLikeScore ?? 0,
    Math.min(1, (returnMemory?.visitCount ?? 0) / 8),
    context.band.consecutiveSeasonsOnTile >= 2 ? 0.34 : 0,
  ));

  if (strength < 0.12) {
    return undefined;
  }

  return {
    family: "repeated_return",
    publicLabel: "Repeated use leaves a weak foothold",
    meaning: "Return or continued camp use makes this place easier to recognize as usable, without making it fixed.",
    status: proto?.activeStatus === "stale" ? "stale" : strength >= 0.45 ? "active" : "weak",
    confidence: round2(strength),
    livedBasis: "lived",
    uncertainty: "Repeated return may reflect lack of alternatives as much as local suitability.",
    practicalLimit: "This is a remembered usable spot, not a fixed home.",
    evidence: clampEvidence([
      proto === undefined ? undefined : evidenceFromProtoPlace(context, proto),
      returnMemory === undefined ? undefined : evidenceFromPlaceMemory(context, returnMemory),
      evidenceFromActivityLabor(context),
    ]),
    score: strength + 0.08,
  };
}

function buildWaterRefugeFactor(context: CampFootholdContext): CampFactorDraft | undefined {
  const tile = context.currentTile;
  const waterAccess = tile?.resourceProfile.waterAccess ?? 0;
  const protoWater = Math.max(0, ...context.protoPlaces.map((place) => place.waterRefugeReliability));
  const waterKnowledge = context.knowledgeItems.find((item) => item.domain === "water_refuge");
  const waterStress = context.band.seasonalSupport?.currentSeasonSupport.waterStress ?? context.band.pressureState?.waterStress ?? 0;
  const strength = clamp01(Math.max(waterAccess, protoWater, waterKnowledge?.confidence ?? 0, waterStress * 0.7));

  if (strength < 0.14) {
    return undefined;
  }

  return {
    family: "water_refuge",
    publicLabel: "Water or refuge helps hold the camp",
    meaning: "Known water, wetland, coast, or refuge value makes repeated camp use easier to explain.",
    status: waterStress >= 0.45 ? "strained" : strength >= 0.55 ? "active" : "weak",
    confidence: round2(strength),
    livedBasis: waterKnowledge?.livedStatus === "inherited_not_personally_lived" ? "inherited_not_lived" : "lived",
    uncertainty: "Water presence is not the same as safe or effortless water use.",
    practicalLimit: "This only explains pull toward a usable camp context.",
    evidence: clampEvidence([
      evidenceFromCurrentTile(context, tile, context.band.position),
      waterKnowledge === undefined ? undefined : evidenceFromKnowledge(waterKnowledge),
      evidenceFromSeasonalSupport(context, "water/refuge pressure"),
    ]),
    score: strength + (waterStress >= 0.45 ? 0.12 : 0),
  };
}

function buildShelterExposureFactor(context: CampFootholdContext): CampFactorDraft | undefined {
  const tile = context.currentTile;
  const shelterAffordance = findAffordance(context, "shelter_camp_structure");
  const exposureMemory = context.band.bodyCampLogistics?.weatherMemories.find((memory) =>
    memory.kind === "cold_exposure" ||
    memory.kind === "heat_drought" ||
    memory.kind === "floodplain_wetland");
  const terrainExposure = tile === undefined ? 0 : (
    tile.terrainKind === "mountains" || tile.terrainKind === "desert" ? 0.42 :
    tile.terrainKind === "wetlands" ? 0.32 :
    tile.terrainKind === "forest" || tile.biomeKind === "temperate_forest" || tile.biomeKind === "boreal_forest" ? 0.2 :
    0.16
  );
  const strength = clamp01(Math.max(shelterAffordance?.confidence ?? 0, exposureMemory?.strength ?? 0, terrainExposure));

  if (strength < 0.16) {
    return undefined;
  }

  return {
    family: "shelter_exposure",
    publicLabel: "Shelter and exposure shape the stop",
    meaning: "Weather, shade, wind, wet ground, or shelter material can make camp setup feel harder or more workable.",
    status: exposureMemory !== undefined && exposureMemory.strength >= 0.42 ? "strained" : shelterAffordance?.status === "plausible" || shelterAffordance?.status === "strong" ? "active" : "weak",
    confidence: round2(strength),
    livedBasis: shelterAffordance?.livedBasis === "inherited_not_lived" ? "inherited_not_lived" : "lived",
    uncertainty: "Shelter usefulness is inferred from known terrain and recent body/camp cues, not a built structure.",
    practicalLimit: "This creates camp context only.",
    evidence: clampEvidence([
      shelterAffordance === undefined ? undefined : evidenceFromAffordance(shelterAffordance),
      exposureMemory === undefined ? undefined : evidenceFromBodyCamp(context, "care", "weather exposure memory", exposureMemory.strength, exposureMemory.sourceReasonIds),
      evidenceFromCurrentTile(context, tile, context.band.position),
    ]),
    score: strength,
  };
}

function buildFireHearthFuelFactor(context: CampFootholdContext): CampFactorDraft | undefined {
  const fire = context.band.bodyCampLogistics?.fire;
  const affordance = findAffordance(context, "fire_hearth_fuel");
  const strength = clamp01(Math.max(fire?.usefulness ?? 0, affordance?.confidence ?? 0, fire?.need ?? 0));

  if (strength < 0.12) {
    return undefined;
  }

  return {
    family: "fire_hearth_fuel",
    publicLabel: "Fire and fuel matter here",
    meaning: "The camp context makes fuel, warmth, smoke, or processing fire more legible as day-to-day work.",
    status: fire?.status === "limited_by_fuel" || fire?.status === "strained" || fire?.status === "risky" ? "strained" : strength >= 0.45 ? "active" : "weak",
    confidence: round2(strength),
    livedBasis: affordance?.livedBasis === "inherited_not_lived" ? "inherited_not_lived" : "lived",
    uncertainty: "Fire is ordinary camp context here, not a new global method.",
    practicalLimit: "No permanent hearth or fire technology is created.",
    evidence: clampEvidence([
      fire === undefined ? undefined : evidenceFromBodyCamp(context, "fire", `fire status ${fire.status.replace(/_/g, " ")}`, strength, fire.reasonIds),
      affordance === undefined ? undefined : evidenceFromAffordance(affordance),
      evidenceFromSeasonalTask(context, "processing_firewood"),
    ]),
    score: strength + (fire?.fuelPressure ?? 0) * 0.15,
  };
}

function buildCareCampOrganizationFactor(context: CampFootholdContext): CampFactorDraft | undefined {
  const care = context.band.bodyCampLogistics?.careTravelBurden;
  const logistics = context.band.bodyCampLogistics?.logisticCapacity;
  const load = clamp01(Math.max(
    care === undefined ? 0 : Math.max(care.dependentCarryBurden, care.elderTravelCaution, care.sickCareBurden, care.coldHeatVulnerability),
    logistics?.careLoad ?? 0,
    context.band.demography.dependents / Math.max(1, context.band.demography.population),
    context.band.demography.elders / Math.max(1, context.band.demography.population),
  ));

  if (load < 0.12) {
    return undefined;
  }

  return {
    family: "care_camp_organization",
    publicLabel: "Care and camp work constrain activity",
    meaning: "Dependents, elders, sickness, and adult labor limits make camp organization part of the practical burden.",
    status: load >= 0.48 || logistics?.state === "strained" || logistics?.state === "overloaded" ? "strained" : "active",
    confidence: round2(load),
    livedBasis: "lived",
    uncertainty: "This is aggregate care pressure, not named family or kinship structure.",
    practicalLimit: "It can explain labor limits, but creates no new social system.",
    evidence: clampEvidence([
      care === undefined ? undefined : evidenceFromBodyCamp(context, "care", "care travel burden", load, care.reasonIds),
      logistics === undefined ? undefined : evidenceFromBodyCamp(context, "care", `logistics ${logistics.state}`, 1 - logistics.capacity, logistics.reasonIds),
      evidenceFromDemography(context),
    ]),
    score: load + 0.36,
  };
}

function buildTemporaryStorageCacheFactor(context: CampFootholdContext): CampFactorDraft | undefined {
  const storageProto = context.protoPlaces.find((place) => place.storageProcessingScore >= 0.18);
  const foodProcessing = findAffordance(context, "food_processing");
  const carrying = findAffordance(context, "carrying_containers_cordage");
  const storageCandidate = context.practiceCandidates.find((candidate) =>
    candidate.family === "food_processing_trial" ||
    candidate.family === "carrying_container_cordage" ||
    candidate.publicLabel.toLowerCase().includes("holding") ||
    candidate.publicLabel.toLowerCase().includes("carry"));
  const storageCards = context.band.resourceEcology?.storageSuitabilityCards ?? [];
  const storageCardStrength = Math.max(
    0,
    ...storageCards.slice(0, 4).map((card) => Math.max(card.storageConfidence, card.immediateUseValue)),
  );
  const strength = clamp01(Math.max(
    storageProto?.storageProcessingScore ?? 0,
    (foodProcessing?.confidence ?? 0) * 0.72,
    (carrying?.confidence ?? 0) * 0.62,
    storageCandidate?.confidence ?? 0,
    storageCardStrength * 0.55,
  ));

  if (strength < 0.14) {
    return undefined;
  }

  return {
    family: "temporary_storage_cache",
    publicLabel: "Short-term holding may be useful",
    meaning: "Repeated camp use, processing work, and carrying pressure can make brief local holding plausible.",
    status: "local_only",
    confidence: round2(strength),
    livedBasis: storageCandidate?.evidence.some((evidence) => evidence.livedBasis === "inherited_not_lived") === true ? "mixed" : "lived",
    uncertainty: "Anything kept here is fragile, seasonal, and easy to lose or forget.",
    practicalLimit: "No inventory, surplus store, property claim, or population effect exists.",
    evidence: clampEvidence([
      storageProto === undefined ? undefined : evidenceFromProtoPlace(context, storageProto),
      foodProcessing === undefined ? undefined : evidenceFromAffordance(foodProcessing),
      evidenceFromPracticeActivity(storageCandidate) ?? evidenceFromAffordanceActivity(foodProcessing),
      evidenceFromTrip(context, context.recentTrips[0]),
      evidenceFromActivityLabor(context),
      storageCandidate === undefined ? undefined : evidenceFromPracticeCandidate(storageCandidate),
    ]),
    score: strength + 0.05,
  };
}

function buildFoodProcessingPlaceFactor(context: CampFootholdContext): CampFactorDraft | undefined {
  const foodProcessing = findAffordance(context, "food_processing");
  const processingTask = context.band.bodyCampLogistics?.seasonalTasks.find((task) => task.category === "processing_firewood" || task.category === "plant_observation");
  const foodTrips = context.recentTrips.filter((trip) =>
    trip.taskGroupType === "plant_gathering_group" ||
    trip.taskGroupType === "fishing_group" ||
    trip.taskGroupType === "local_foraging_group");
  const strength = clamp01(Math.max(
    foodProcessing?.confidence ?? 0,
    processingTask?.urgency ?? 0,
    Math.min(0.6, foodTrips.length * 0.12),
  ));

  if (strength < 0.14) {
    return undefined;
  }

  return {
    family: "food_processing_place",
    publicLabel: "Food work clusters near camp",
    meaning: "Repeated food work and processing questions make this camp context matter, but no processing method is reliable.",
    status: processingTask !== undefined && processingTask.urgency >= 0.45 ? "active" : "weak",
    confidence: round2(strength),
    livedBasis: foodProcessing?.livedBasis === "inherited_not_lived" ? "inherited_not_lived" : "lived",
    uncertainty: "Repeated food work can also be a low-return routine.",
    practicalLimit: "This is only a place/context signal.",
    evidence: clampEvidence([
      foodProcessing === undefined ? undefined : evidenceFromAffordance(foodProcessing),
      processingTask === undefined ? undefined : evidenceFromSeasonalTask(context, processingTask.category),
      evidenceFromTrip(context, foodTrips[0]),
    ]),
    score: strength,
  };
}

function buildRouteCrossingUseFactor(context: CampFootholdContext): CampFactorDraft | undefined {
  const crossingProto = context.protoPlaces.find((place) => place.crossingUseScore >= 0.18);
  const crossingFrame = context.problemFrames.find((frame) => frame.family === "crossing_blocked_path" || frame.family === "route_new_country_uncertainty");
  const crossingCandidate = context.practiceCandidates.find((candidate) => candidate.family === "crossing_route_trial");
  const routeKnowledge = context.knowledgeItems.find((item) => item.domain === "route_corridor" || item.domain === "crossing");
  const crossingMemories = Object.values(context.band.crossingMemories);
  const strength = clamp01(Math.max(
    crossingProto?.crossingUseScore ?? 0,
    crossingFrame?.confidence ?? 0,
    crossingCandidate?.confidence ?? 0,
    routeKnowledge?.confidence ?? 0,
    Math.min(0.55, crossingMemories.length * 0.16),
  ));

  if (strength < 0.14) {
    return undefined;
  }

  return {
    family: "route_crossing_use",
    publicLabel: "Route or crossing value shapes the stop",
    meaning: "The place may work because it sits near a known route, crossing, or uncertain passage.",
    status: crossingFrame !== undefined ? "active" : "remembered",
    confidence: round2(strength),
    livedBasis: routeKnowledge?.livedStatus === "inherited_not_personally_lived" ? "inherited_not_lived" : "lived",
    uncertainty: "A route explanation may hide carrying or care burden.",
    practicalLimit: "No bridge, boat, or crossing skill is created.",
    evidence: clampEvidence([
      crossingProto === undefined ? undefined : evidenceFromProtoPlace(context, crossingProto),
      crossingFrame === undefined ? undefined : evidenceFromProblemFrame(crossingFrame),
      routeKnowledge === undefined ? undefined : evidenceFromKnowledge(routeKnowledge),
    ]),
    score: strength + 0.04,
  };
}

function buildCampEcologyWearFactor(context: CampFootholdContext): CampFactorDraft | undefined {
  const campCleanliness = context.band.bodyCampLogistics?.campCleanliness;
  const usePressure = context.band.usePressure[context.band.position];
  const protoPressure = Math.max(0, ...context.protoPlaces.map((place) => place.ecologicalPressure));
  const pressure = clamp01(Math.max(
    campCleanliness?.pressure ?? 0,
    usePressure?.recentUseIntensity ?? 0,
    usePressure?.foragingPressure ?? 0,
    usePressure?.waterPressure ?? 0,
    protoPressure,
  ));
  const recovery = clamp01(Math.max(campCleanliness?.recovery ?? 0, usePressure?.recoveryProgress ?? 0));

  if (pressure < 0.12 && recovery < 0.18) {
    return undefined;
  }

  return {
    family: "camp_ecology_wear",
    publicLabel: pressure >= recovery ? "Camp use is wearing the place" : "The place may be recovering",
    meaning: pressure >= recovery
      ? "Repeated use, waste, water pressure, or trampling may make the camp more costly."
      : "Recent pressure appears to be fading, which can make return more plausible.",
    status: pressure >= 0.5 ? "fragile" : recovery >= 0.32 ? "remembered" : "weak",
    confidence: round2(Math.max(pressure, recovery)),
    livedBasis: "lived",
    uncertainty: "Wear is a local pressure signal, not a full camp ecology model.",
    practicalLimit: "No sanitation, management rule, or lasting improvement is created.",
    evidence: clampEvidence([
      campCleanliness === undefined ? undefined : evidenceFromBodyCamp(context, "ecology", `camp cleanliness ${campCleanliness.state}`, campCleanliness.pressure, campCleanliness.reasonIds),
      usePressure === undefined ? undefined : evidenceFromUsePressure(context, usePressure.recentUseIntensity),
      evidenceFromSeasonalSupport(context, "local pressure"),
    ]),
    score: Math.max(pressure, recovery) + 0.08,
  };
}

function buildSafetyRiskFactor(context: CampFootholdContext): CampFactorDraft | undefined {
  const event = context.events.find((entry) =>
    entry.family === "food_water_pressure" ||
    entry.family === "route_crossing" ||
    entry.family === "movement_place");
  const riskKnowledge = context.knowledgeItems.find((item) => item.domain === "risk_caution");
  const acute = Math.max(0, ...(context.band.acuteRisk?.recentEpisodes ?? []).map((episode) => severityToNumber(episode.severity)));
  const risk = clamp01(Math.max(event?.severity ?? 0, riskKnowledge?.confidence ?? 0, acute));

  if (risk < 0.16) {
    return undefined;
  }

  return {
    family: "safety_risk",
    publicLabel: "Risk memory travels with the camp",
    meaning: "Recent hardship, caution knowledge, or risky movement can make a foothold feel safer or more doubtful.",
    status: risk >= 0.48 ? "strained" : "remembered",
    confidence: round2(risk),
    livedBasis: riskKnowledge?.livedStatus === "inherited_not_personally_lived" || event?.livedStatus === "inherited_not_personally_lived"
      ? "inherited_not_lived"
      : "lived",
    uncertainty: "The band may remember the danger without separating the full cause.",
    practicalLimit: "This is risk/caution context only.",
    evidence: clampEvidence([
      event === undefined ? undefined : evidenceFromEvent(event),
      riskKnowledge === undefined ? undefined : evidenceFromKnowledge(riskKnowledge),
      evidenceFromSeasonalSupport(context, "risk or hardship"),
    ]),
    score: risk,
  };
}

function makeFactor(
  context: CampFootholdContext,
  places: readonly CampFootholdPlace[],
  draft: CampFactorDraft,
): CampFootholdFactor {
  const related = collectRelatedFromEvidence(draft.evidence);
  const relatedPlaces = places
    .filter((place) =>
      draft.evidence.some((evidence) => evidence.tileId !== undefined && evidence.tileId === place.tileId))
    .map((place) => place.id)
    .slice(0, 4);

  return {
    id: `camp-factor:${String(context.band.id)}:${draft.family}`,
    family: draft.family,
    publicLabel: draft.publicLabel,
    meaning: draft.meaning,
    status: draft.status,
    confidence: draft.confidence,
    livedBasis: draft.livedBasis,
    uncertainty: draft.uncertainty,
    practicalLimit: draft.practicalLimit,
    evidence: draft.evidence,
    relatedPlaceIds: relatedPlaces,
    relatedAffordanceIds: related.affordanceIds,
    relatedProblemFrameIds: related.problemFrameIds,
    relatedPracticeCandidateIds: related.practiceCandidateIds,
    relatedKnowledgeIds: related.knowledgeIds,
    relatedEventIds: related.eventIds,
    noDecisionInfluence: true,
  };
}

function deriveTemporaryCacheSignals(
  context: CampFootholdContext,
  places: readonly CampFootholdPlace[],
  factors: readonly CampFootholdFactor[],
): readonly TemporaryCacheSignal[] {
  const storageFactor = factors.find((factor) => factor.family === "temporary_storage_cache");
  const processingFactor = factors.find((factor) => factor.family === "food_processing_place");
  const carrying = findAffordance(context, "carrying_containers_cordage");
  const foodProcessing = findAffordance(context, "food_processing");
  const candidate = context.practiceCandidates.find((entry) =>
    entry.family === "carrying_container_cordage" ||
    entry.family === "food_processing_trial");
  const evidence = clampEvidence([
    storageFactor?.evidence[0],
    processingFactor?.evidence[0],
    carrying === undefined ? undefined : evidenceFromAffordance(carrying),
    foodProcessing === undefined ? undefined : evidenceFromAffordance(foodProcessing),
    candidate === undefined ? undefined : evidenceFromPracticeCandidate(candidate),
  ]);
  const confidence = round2(clamp01(Math.max(
    storageFactor?.confidence ?? 0,
    processingFactor?.confidence ?? 0,
    (carrying?.confidence ?? 0) * 0.55,
    candidate?.confidence ?? 0,
  )));

  if (confidence < 0.14 || evidence.length === 0) {
    return [];
  }

  const signal: TemporaryCacheSignal = {
    id: `temporary-cache:${String(context.band.id)}:local-holding`,
    publicLabel: "Brief local holding",
    meaning: "A used camp place may support keeping or drying small things briefly near work.",
    status: confidence >= 0.38 ? "local_only" : "weak",
    confidence,
    materialBasis: uniqueStrings([
      ...(carrying?.materialBasis ?? []),
      ...(foodProcessing?.materialBasis ?? []),
      ...(candidate?.materialBasis ?? []),
    ]).slice(0, BASIS_PER_SIGNAL_CAP),
    activityBasis: uniqueStrings([
      ...(foodProcessing?.activityEventBasis ?? []),
      ...(candidate?.activityRepetitionBasis ?? []),
      recentTripBasis(context),
    ]).filter(Boolean).slice(0, BASIS_PER_SIGNAL_CAP),
    riskLine: "Fragile, seasonal, local, and easily spoiled, lost, or forgotten.",
    evidence,
    relatedPlaceIds: places.slice(0, 2).map((place) => place.id),
    relatedAffordanceIds: uniqueStrings([
      carrying?.id ?? "",
      foodProcessing?.id ?? "",
    ].filter(Boolean)),
    relatedProblemFrameIds: uniqueStrings([
      storageFactor?.relatedProblemFrameIds[0] ?? "",
      processingFactor?.relatedProblemFrameIds[0] ?? "",
      candidate?.problemFrameId ?? "",
    ].filter(Boolean)),
    fragileLocalOnly: true,
    noInventory: true,
    noSurplusEconomy: true,
    noPropertyClaim: true,
    noPopulationBonus: true,
    noSkillUnlocked: true,
    noAutomaticImprovement: true,
    futureHook: "temporary_cache_practice_learning_candidate",
  };

  return [signal].slice(0, STORAGE_SIGNAL_CAP);
}

function deriveFireHearthFuelSignals(
  context: CampFootholdContext,
  places: readonly CampFootholdPlace[],
  factors: readonly CampFootholdFactor[],
): readonly CampFireHearthFuelSignal[] {
  const fire = context.band.bodyCampLogistics?.fire;
  const fireFactor = factors.find((factor) => factor.family === "fire_hearth_fuel");
  const affordance = findAffordance(context, "fire_hearth_fuel");
  const confidence = round2(clamp01(Math.max(fireFactor?.confidence ?? 0, fire?.usefulness ?? 0, affordance?.confidence ?? 0)));

  if (confidence < 0.12 || fire === undefined) {
    return [];
  }

  const signal: CampFireHearthFuelSignal = {
    id: `fire-hearth-fuel:${String(context.band.id)}:camp-context`,
    publicLabel: "Camp fire and fuel context",
    meaning: fire.status === "limited_by_fuel" || fire.status === "strained"
      ? "Fire is useful here, but fuel or labor makes it costly."
      : "Fire, fuel, warmth, smoke, or processing work is legible in this camp context.",
    status: fire.status === "limited_by_fuel" || fire.status === "strained" || fire.status === "risky" ? "strained" : "active",
    confidence,
    fuelLine: `fuel basis ${percent(fire.fuelBasis)} · fuel pressure ${percent(fire.fuelPressure)}`,
    burdenLine: `need ${percent(fire.need)} · labor ${percent(fire.laborCost)} · risk ${percent(fire.fireRisk)}`,
    evidence: clampEvidence([
      evidenceFromBodyCamp(context, "fire", `fire status ${fire.status.replace(/_/g, " ")}`, confidence, fire.reasonIds),
      affordance === undefined ? undefined : evidenceFromAffordance(affordance),
      fireFactor?.evidence[0],
    ]),
    relatedPlaceIds: places.slice(0, 2).map((place) => place.id),
    relatedAffordanceIds: affordance === undefined ? [] : [affordance.id],
    noPermanentHearth: true,
    noTechnologyTree: true,
    noSkillUnlocked: true,
    fireIsCampContextOnly: true,
  };

  return [signal].slice(0, FIRE_SIGNAL_CAP);
}

function deriveCareCampSignals(
  context: CampFootholdContext,
  places: readonly CampFootholdPlace[],
  factors: readonly CampFootholdFactor[],
): readonly CareCampOrganizationSignal[] {
  const care = context.band.bodyCampLogistics?.careTravelBurden;
  const logistics = context.band.bodyCampLogistics?.logisticCapacity;
  const factor = factors.find((entry) => entry.family === "care_camp_organization");
  const confidence = round2(clamp01(Math.max(
    factor?.confidence ?? 0,
    care?.dependentCarryBurden ?? 0,
    care?.sickCareBurden ?? 0,
    logistics?.careLoad ?? 0,
  )));

  if (confidence < 0.12 || care === undefined || logistics === undefined) {
    return [];
  }

  const signal: CareCampOrganizationSignal = {
    id: `care-camp:${String(context.band.id)}:aggregate-burden`,
    publicLabel: "Care burden at camp",
    meaning: "Dependents, elders, sick care, crossing burden, or labor tightness make the camp a care/work problem.",
    status: logistics.state === "strained" || logistics.state === "overloaded" || confidence >= 0.45 ? "strained" : "active",
    confidence,
    careLine: `dependents ${context.band.demography.dependents} · elders ${context.band.demography.elders} · sick care ${percent(care.sickCareBurden)}`,
    laborLine: `${logistics.state.replace(/_/g, " ")} · spare adult labor ${percent(logistics.spareAdultLabor)} · carrying load ${percent(logistics.carryingLoad)}`,
    evidence: clampEvidence([
      evidenceFromBodyCamp(context, "care", "care travel burden", confidence, care.reasonIds),
      evidenceFromBodyCamp(context, "care", `logistics ${logistics.state}`, 1 - logistics.capacity, logistics.reasonIds),
      evidenceFromDemography(context),
    ]),
    relatedPlaceIds: places.slice(0, 2).map((place) => place.id),
    aggregateOnly: true,
    noKinshipNetwork: true,
    noNamedPeople: true,
    noDecisionInfluence: true,
  };

  return [signal].slice(0, CARE_SIGNAL_CAP);
}

function evidenceFromProtoPlace(context: CampFootholdContext, place: ProtoCampPlaceMemory): CampFootholdEvidenceRef {
  return {
    kind: "place",
    sourceSystem: "proto_camp_memory",
    label: `camp memory: ${place.campLikeState.replace(/_/g, " ")}`,
    sourceId: `proto-camp:${String(context.band.id)}:${String(place.tileId)}`,
    confidence: round2(place.confidence),
    livedBasis: "lived",
    tileId: place.tileId,
    reasonIds: place.reasonIds.slice(0, 6),
  };
}

function evidenceFromPlaceMemory(
  context: CampFootholdContext,
  memory: PlaceMemoryRecord | undefined,
): CampFootholdEvidenceRef | undefined {
  if (memory === undefined) {
    return undefined;
  }

  return {
    kind: "memory",
    sourceSystem: "place_memory",
    label: memory.isReturnPlace
      ? `return memory (${memory.repeatedReturnCount})`
      : `place visits (${memory.visitCount})`,
    sourceId: `place-memory:${String(context.band.id)}:${String(memory.tileId)}`,
    confidence: round2(memory.confidence),
    livedBasis: "lived",
    tileId: memory.tileId,
    reasonIds: memory.reasonIds?.slice(0, 6) ?? [],
  };
}

function evidenceFromCurrentTile(
  context: CampFootholdContext,
  tile: Tile | undefined,
  tileId: TileId,
): CampFootholdEvidenceRef | undefined {
  if (tile === undefined) {
    return undefined;
  }

  const water = tile.resourceProfile.waterAccess;

  return {
    kind: "ecology",
    sourceSystem: "current_tile",
    label: `${terrainLabel(tile)} camp context`,
    sourceId: `current-tile:${String(context.band.id)}:${String(tileId)}`,
    confidence: round2(clamp01(0.2 + water * 0.36 + (tile.isRiverbank || tile.isCoastal || tile.isFloodplain ? 0.18 : 0))),
    livedBasis: tileId === context.band.position ? "lived" : "unknown",
    tileId,
    reasonIds: [makeCampReasonId(context.band.id, "current-tile", tileId)],
  };
}

function evidenceFromActivityLabor(context: CampFootholdContext): CampFootholdEvidenceRef | undefined {
  const labor = context.band.activityLaborSummary;
  if (labor === undefined) {
    return undefined;
  }

  return {
    kind: "activity",
    sourceSystem: "activity_labor",
    label: `camp labor remainder ${labor.peopleAtResidentialCenterEstimate}`,
    sourceId: `activity-labor:${String(context.band.id)}:${String(labor.tick)}:${String(labor.day)}`,
    confidence: round2(clamp01(0.22 + labor.activeActivityGroupCount * 0.08 + labor.peopleAtResidentialCenterEstimate / Math.max(1, context.band.size) * 0.35)),
    livedBasis: "lived",
    tileId: context.band.position,
    reasonIds: [makeCampReasonId(context.band.id, "activity-labor", context.band.position)],
  };
}

function evidenceFromTrip(
  context: CampFootholdContext,
  trip: IntraSeasonTripRecord | undefined,
): CampFootholdEvidenceRef | undefined {
  if (trip === undefined) {
    return undefined;
  }

  return {
    kind: "activity",
    sourceSystem: "activity_party",
    label: trip.groupLabel,
    sourceId: makeTripSourceId(trip),
    confidence: round2(clamp01(0.28 + trip.resourceReturn.returnConfidence * 0.42)),
    livedBasis: "lived",
    tileId: trip.originTileId,
    activityId: makeTripSourceId(trip),
    reasonIds: trip.reasonIds.slice(0, 6),
  };
}

function evidenceFromAffordance(item: MaterialAffordanceItem): CampFootholdEvidenceRef {
  return {
    kind: "affordance",
    sourceSystem: "material_affordance",
    label: item.publicLabel,
    sourceId: item.id,
    confidence: round2(item.confidence),
    livedBasis: item.livedBasis === "inherited_not_lived" ? "inherited_not_lived" : item.livedBasis === "mixed" ? "mixed" : "lived",
    affordanceId: item.id,
    tileId: item.evidence.find((evidence) => evidence.tileId !== undefined)?.tileId,
    reasonIds: item.evidence.flatMap((evidence) => evidence.reasonIds).slice(0, 6),
  };
}

function evidenceFromProblemFrame(frame: ProblemFrame): CampFootholdEvidenceRef {
  return {
    kind: "problem_practice",
    sourceSystem: "problem_practice",
    label: frame.publicLabel,
    sourceId: frame.id,
    confidence: round2(frame.confidence),
    livedBasis: frame.livedBasis === "inherited_not_lived" ? "inherited_not_lived" : frame.livedBasis === "mixed" ? "mixed" : "lived",
    problemFrameId: frame.id,
    tileId: frame.evidence.find((evidence) => evidence.tileId !== undefined)?.tileId,
    reasonIds: frame.evidence.flatMap((evidence) => evidence.reasonIds).slice(0, 6),
  };
}

function evidenceFromPracticeCandidate(candidate: PracticeExperimentCandidate): CampFootholdEvidenceRef {
  return {
    kind: "problem_practice",
    sourceSystem: "problem_practice",
    label: candidate.publicLabel,
    sourceId: candidate.id,
    confidence: round2(candidate.confidence),
    livedBasis: candidate.evidence.some((evidence) => evidence.livedBasis === "inherited_not_lived") ? "mixed" : "lived",
    problemFrameId: candidate.problemFrameId,
    practiceCandidateId: candidate.id,
    affordanceId: candidate.relatedAffordanceIds[0],
    tileId: candidate.evidence.find((evidence) => evidence.tileId !== undefined)?.tileId,
    reasonIds: candidate.evidence.flatMap((evidence) => evidence.reasonIds).slice(0, 6),
  };
}

function evidenceFromPracticeActivity(candidate: PracticeExperimentCandidate | undefined): CampFootholdEvidenceRef | undefined {
  const evidence = candidate?.evidence.find((entry) =>
    entry.sourceSystem === "activity_party" ||
    entry.sourceSystem === "activity_summary" ||
    entry.sourceSystem === "residential_move");
  if (candidate === undefined || evidence === undefined) {
    return undefined;
  }

  return {
    kind: "activity",
    sourceSystem: "activity_party",
    label: evidence.label,
    sourceId: evidence.sourceId,
    confidence: round2(evidence.confidence),
    livedBasis: evidence.livedBasis === "inherited_not_lived" ? "inherited_not_lived" : evidence.livedBasis === "mixed" ? "mixed" : "lived",
    practiceCandidateId: candidate.id,
    problemFrameId: candidate.problemFrameId,
    activityId: evidence.activityId ?? evidence.sourceId,
    tileId: evidence.tileId,
    reasonIds: evidence.reasonIds.slice(0, 6),
  };
}

function evidenceFromAffordanceActivity(item: MaterialAffordanceItem | undefined): CampFootholdEvidenceRef | undefined {
  const evidence = item?.evidence.find((entry) =>
    entry.sourceSystem === "activity_party" ||
    entry.sourceSystem === "activity_summary" ||
    entry.sourceSystem === "residential_move");
  if (item === undefined || evidence === undefined) {
    return undefined;
  }

  return {
    kind: "activity",
    sourceSystem: "activity_party",
    label: evidence.label,
    sourceId: evidence.sourceId,
    confidence: round2(evidence.confidence),
    livedBasis: evidence.livedBasis === "inherited_not_lived" ? "inherited_not_lived" : evidence.livedBasis === "mixed" ? "mixed" : "lived",
    affordanceId: item.id,
    activityId: evidence.sourceId,
    tileId: evidence.tileId,
    reasonIds: evidence.reasonIds.slice(0, 6),
  };
}

function evidenceFromKnowledge(item: KnowledgeEcologyItem): CampFootholdEvidenceRef {
  return {
    kind: "knowledge",
    sourceSystem: "knowledge_ecology",
    label: item.livedStatus === "inherited_not_personally_lived" ? `inherited: ${item.title}` : item.title,
    sourceId: item.id,
    confidence: round2(item.confidence),
    livedBasis: item.livedStatus === "inherited_not_personally_lived" ? "inherited_not_lived" : "lived",
    knowledgeId: item.id,
    tileId: item.involvedTileIds[0],
    reasonIds: item.evidence.flatMap((evidence) => evidence.reasonIds).slice(0, 6),
  };
}

function evidenceFromEvent(event: CanonicalEvent): CampFootholdEvidenceRef {
  return {
    kind: "event",
    sourceSystem: "canonical_event",
    label: event.livedStatus === "inherited_not_personally_lived" ? `inherited: ${event.title}` : event.title,
    sourceId: event.id,
    confidence: round2(clamp01(event.significance)),
    livedBasis: event.livedStatus === "inherited_not_personally_lived" ? "inherited_not_lived" : "lived",
    eventId: event.id,
    tileId: event.involvedTileIds[0],
    reasonIds: event.sourceReasonIds.slice(0, 6),
  };
}

function evidenceFromBodyCamp(
  context: CampFootholdContext,
  kind: "care" | "fire" | "ecology",
  label: string,
  confidence: number,
  reasonIds: readonly ReasonId[],
): CampFootholdEvidenceRef {
  return {
    kind,
    sourceSystem: "body_camp_logistics",
    label,
    sourceId: `body-camp:${String(context.band.id)}:${String(context.band.bodyCampLogistics?.lastUpdatedTick ?? context.world.time.tick)}:${kind}`,
    confidence: round2(clamp01(confidence)),
    livedBasis: "lived",
    tileId: context.band.position,
    reasonIds: reasonIds.slice(0, 6),
  };
}

function evidenceFromSeasonalSupport(
  context: CampFootholdContext,
  label: string,
): CampFootholdEvidenceRef | undefined {
  const support = context.band.seasonalSupport;
  if (support === undefined) {
    return undefined;
  }

  return {
    kind: "seasonal",
    sourceSystem: "seasonal_support",
    label,
    sourceId: `seasonal-support:${String(context.band.id)}:${String(context.world.time.tick)}`,
    confidence: round2(clamp01(Math.max(
      support.currentSeasonSupport.foodStress,
      support.currentSeasonSupport.waterStress,
      support.currentSeasonSupport.deficitRatio,
      support.rolling4SeasonSupport < 0.55 ? 0.35 : 0,
    ))),
    livedBasis: "lived",
    tileId: context.band.position,
    reasonIds: support.reasonIds.slice(0, 6),
  };
}

function evidenceFromSeasonalTask(
  context: CampFootholdContext,
  category: string,
): CampFootholdEvidenceRef | undefined {
  const task = context.band.bodyCampLogistics?.seasonalTasks.find((entry) => entry.category === category);
  if (task === undefined) {
    return undefined;
  }

  return {
    kind: "activity",
    sourceSystem: "body_camp_logistics",
    label: task.reason,
    sourceId: `seasonal-task:${String(context.band.id)}:${task.category}`,
    confidence: round2(task.urgency),
    livedBasis: "lived",
    tileId: context.band.position,
    reasonIds: task.reasonIds.slice(0, 6),
  };
}

function evidenceFromDemography(context: CampFootholdContext): CampFootholdEvidenceRef {
  const population = Math.max(1, context.band.demography.population);
  const load = clamp01((context.band.demography.dependents + context.band.demography.elders) / population);

  return {
    kind: "demography",
    sourceSystem: "demography",
    label: `${context.band.demography.dependents} dependents, ${context.band.demography.elders} elders`,
    sourceId: `demography:${String(context.band.id)}:${String(context.band.demography.lastDemographicUpdate.tick)}`,
    confidence: round2(clamp01(0.2 + load * 0.68)),
    livedBasis: "lived",
    tileId: context.band.position,
    reasonIds: context.band.demography.sourceReasonIds.slice(0, 6),
  };
}

function evidenceFromUsePressure(context: CampFootholdContext, confidence: number): CampFootholdEvidenceRef {
  const pressure = context.band.usePressure[context.band.position];

  return {
    kind: "ecology",
    sourceSystem: "use_pressure",
    label: "local use pressure",
    sourceId: `use-pressure:${String(context.band.id)}:${String(context.band.position)}`,
    confidence: round2(clamp01(confidence)),
    livedBasis: "lived",
    tileId: context.band.position,
    reasonIds: pressure?.reasonIds.slice(0, 6) ?? [makeCampReasonId(context.band.id, "use-pressure", context.band.position)],
  };
}

function findAffordance(
  context: CampFootholdContext,
  family: MaterialAffordanceItem["family"],
): MaterialAffordanceItem | undefined {
  return context.materialItems.find((item) => item.family === family);
}

function recentTripBasis(context: CampFootholdContext): string {
  const trip = context.recentTrips[0];
  return trip === undefined ? "" : `${trip.groupLabel} near camp`;
}

function makeTripSourceId(trip: IntraSeasonTripRecord): string {
  return `trip:${String(trip.sourceBandId)}:${String(trip.tick)}:${String(trip.day)}:${String(trip.originTileId)}:${String(trip.targetTileId)}:${trip.taskGroupType}`;
}

function collectRelatedFromEvidence(evidence: readonly CampFootholdEvidenceRef[]) {
  return {
    eventIds: uniqueStrings(evidence.map((item) => item.eventId ?? "").filter(Boolean)).slice(0, 4),
    knowledgeIds: uniqueStrings(evidence.map((item) => item.knowledgeId ?? "").filter(Boolean)).slice(0, 4),
    affordanceIds: uniqueStrings(evidence.map((item) => item.affordanceId ?? "").filter(Boolean)).slice(0, 4),
    problemFrameIds: uniqueStrings(evidence.map((item) => item.problemFrameId ?? "").filter(Boolean)).slice(0, 4),
    practiceCandidateIds: uniqueStrings(evidence.map((item) => item.practiceCandidateId ?? "").filter(Boolean)).slice(0, 4),
  };
}

function roleFromProto(proto: ProtoCampPlaceMemory, current: boolean): CampFootholdPlaceRole {
  if (current) return "current_camp_context";
  if (proto.activeStatus === "stale" || proto.activeStatus === "abandoned" || proto.campLikeState === "abandoned_camp_trace") return "stale_or_abandoned_trace";
  if (proto.campLikeState === "fragile_camp_like_place" || proto.usePressureStatus === "overused" || proto.usePressureStatus === "worn") return "worn_or_fragile_place";
  if (proto.campLikeState === "storage_processing_candidate" || proto.storageProcessingScore >= 0.28) return "processing_cache_possibility";
  if (proto.campLikeState === "crossing_camp" || proto.crossingUseScore >= 0.28) return "crossing_route_foothold";
  if (proto.campLikeState === "activity_base" || proto.activitySuccessCountNearby >= 2) return "activity_base";
  if (proto.campLikeState === "refuge_anchor" || proto.waterRefugeReliability >= 0.45) return "water_refuge_foothold";
  if (proto.visitCount >= 2 || proto.residentialAnchorUseCount >= 2) return "repeated_return_place";
  return "uncertain_foothold";
}

function statusFromProto(proto: ProtoCampPlaceMemory, current: boolean): CampFootholdSignalStatus {
  if (proto.activeStatus === "stale" || proto.activeStatus === "abandoned") return "stale";
  if (proto.activeStatus === "contested" || proto.usePressureStatus === "overused") return "fragile";
  if (proto.usePressureStatus === "worn") return "strained";
  if (current) return "active";
  if (proto.campLikeScore >= 0.45) return "remembered";
  return "weak";
}

function placeRoleLabel(role: CampFootholdPlaceRole): string {
  switch (role) {
    case "current_camp_context":
      return "Current camp context";
    case "repeated_return_place":
      return "Repeated return place";
    case "water_refuge_foothold":
      return "Water or refuge foothold";
    case "activity_base":
      return "Activity base";
    case "processing_cache_possibility":
      return "Processing or holding place";
    case "crossing_route_foothold":
      return "Route or crossing foothold";
    case "worn_or_fragile_place":
      return "Worn or fragile camp place";
    case "stale_or_abandoned_trace":
      return "Stale camp trace";
    case "uncertain_foothold":
      return "Weak camp foothold";
  }
}

export function campFootholdPlaceRoleLabel(role: CampFootholdPlaceRole): string {
  return placeRoleLabel(role);
}

export function campFootholdFactorFamilyLabel(family: CampFootholdFactorFamily): string {
  switch (family) {
    case "repeated_return":
      return "Repeated return";
    case "water_refuge":
      return "Water/refuge";
    case "shelter_exposure":
      return "Shelter/exposure";
    case "fire_hearth_fuel":
      return "Fire/fuel";
    case "care_camp_organization":
      return "Care/camp work";
    case "temporary_storage_cache":
      return "Short-term holding";
    case "food_processing_place":
      return "Food processing place";
    case "route_crossing_use":
      return "Route/crossing";
    case "camp_ecology_wear":
      return "Camp wear";
    case "safety_risk":
      return "Safety/risk";
  }
}

export function campFootholdStatusLabel(status: CampFootholdSignalStatus): string {
  switch (status) {
    case "active":
      return "active";
    case "remembered":
      return "remembered";
    case "weak":
      return "weak";
    case "strained":
      return "strained";
    case "fragile":
      return "fragile";
    case "stale":
      return "stale";
    case "local_only":
      return "local only";
    case "inherited_not_tested_here":
      return "inherited, untested here";
    case "uncertain":
      return "uncertain";
  }
}

function placeMeaning(proto: ProtoCampPlaceMemory, tile: Tile | undefined, current: boolean): string {
  const placeText = tile === undefined ? "this known place" : `${terrainLabel(tile)} country`;
  if (current) {
    return `The band is using ${placeText}; repeated use has made a weak camp context visible.`;
  }
  if (proto.activeStatus === "stale" || proto.activeStatus === "abandoned") {
    return `They remember a camp trace in ${placeText}, but it is not locally active now.`;
  }
  if (proto.storageProcessingScore >= 0.28) {
    return `Repeated use of ${placeText} makes short-term holding or processing plausible, but fragile.`;
  }
  if (proto.crossingUseScore >= 0.28) {
    return `The place matters partly because it sits near movement or crossing pressure.`;
  }
  if (proto.waterRefugeReliability >= 0.45) {
    return `Known water or refuge value makes this a remembered foothold.`;
  }
  return `The place is remembered as usable, but the foothold is still weak.`;
}

function ecologyLineFromProto(proto: ProtoCampPlaceMemory): string {
  if (proto.ecologicalPressure >= 0.45) {
    return `worn by use ${percent(proto.ecologicalPressure)}; recovery ${percent(proto.ecologicalRecovery)}`;
  }
  if (proto.ecologicalRecovery >= 0.35) {
    return `local recovery ${percent(proto.ecologicalRecovery)} after earlier use`;
  }
  return `use pressure ${percent(proto.ecologicalPressure)}; recovery ${percent(proto.ecologicalRecovery)}`;
}

function currentTileEcologyLine(context: CampFootholdContext, tile: Tile | undefined): string {
  const pressure = context.band.usePressure[context.band.position];
  if (pressure !== undefined) {
    return `local use ${percent(pressure.recentUseIntensity)}; recovery ${percent(pressure.recoveryProgress)}`;
  }
  if (tile !== undefined) {
    return `${terrainLabel(tile)} with water access ${percent(tile.resourceProfile.waterAccess)}`;
  }
  return "local ecology evidence is thin";
}

function currentPlaceReasons(
  context: CampFootholdContext,
  tile: Tile | undefined,
  memory: PlaceMemoryRecord | undefined,
): readonly string[] {
  const reasons: string[] = [];
  if (context.band.consecutiveSeasonsOnTile >= 2) reasons.push("continued camp use");
  if (memory?.isReturnPlace === true) reasons.push("return memory");
  if (tile !== undefined && (tile.resourceProfile.waterAccess >= 0.45 || tile.isRiverbank || tile.isCoastal)) reasons.push("water/refuge nearby");
  if (context.band.activityLaborSummary !== undefined) reasons.push("camp labor remainder");
  if (reasons.length === 0) reasons.push("current band location");
  return reasons.slice(0, 3);
}

function terrainLabel(tile: Tile): string {
  return tile.biomeKind === undefined
    ? tile.terrainKind.replace(/_/g, " ")
    : `${tile.biomeKind.replace(/_/g, " ")} ${tile.terrainKind.replace(/_/g, " ")}`;
}

function summarizeFootholdTitle(
  places: readonly CampFootholdPlace[],
  factors: readonly CampFootholdFactor[],
): string {
  const active = places.find((place) => place.status === "active");
  const topFactor = factors[0];
  if (active !== undefined && topFactor !== undefined) {
    return `${active.publicLabel}: ${topFactor.publicLabel.toLowerCase()}`;
  }
  if (active !== undefined) {
    return active.publicLabel;
  }
  if (topFactor !== undefined) {
    return topFactor.publicLabel;
  }
  return "Weak camp context";
}

function summarizeFootholdLines(
  context: CampFootholdContext,
  places: readonly CampFootholdPlace[],
  factors: readonly CampFootholdFactor[],
  storage: readonly TemporaryCacheSignal[],
  fire: readonly CampFireHearthFuelSignal[],
  care: readonly CareCampOrganizationSignal[],
): readonly string[] {
  const lines: string[] = [];
  const place = places[0];
  if (place !== undefined) {
    lines.push(`${place.meaning} ${place.ecologyLine}.`);
  } else {
    lines.push("Camp evidence is thin; the readout is intentionally cautious.");
  }
  const factorNames = factors.slice(0, 3).map((factor) => campFootholdFactorFamilyLabel(factor.family).toLowerCase());
  lines.push(factorNames.length === 0
    ? "No strong camp factor is grounded yet."
    : `Visible factors: ${factorNames.join(", ")}.`);
  const signalLine = [
    storage.length > 0 ? "brief holding is possible but fragile" : "",
    fire.length > 0 ? "fire/fuel is camp context" : "",
    care.length > 0 ? "care burden is visible" : "",
  ].filter(Boolean).join("; ");
  lines.push(signalLine.length === 0
    ? "No storage, fire, or care signal is strong enough to show beyond general camp use."
    : `${signalLine}.`);
  if (bandHasInheritedDaughterContext(context.band)) {
    lines.push("Inherited memory is separated from local testing where it appears.");
  }
  return lines.slice(0, 4);
}

function bandHasInheritedDaughterContext(band: Band): boolean {
  return band.parentBandId !== undefined || band.inheritanceProfile !== undefined;
}

function clampEvidence(items: readonly (CampFootholdEvidenceRef | undefined)[]): readonly CampFootholdEvidenceRef[] {
  const seen = new Set<string>();
  const kept: CampFootholdEvidenceRef[] = [];
  for (const item of items) {
    if (item === undefined) {
      continue;
    }
    const key = `${item.sourceSystem}:${item.sourceId}:${item.label}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    kept.push(item);
    if (kept.length >= EVIDENCE_PER_ITEM_CAP) {
      break;
    }
  }
  return kept;
}

function compareProtoPlaces(left: ProtoCampPlaceMemory, right: ProtoCampPlaceMemory): number {
  return right.campLikeScore - left.campLikeScore ||
    right.confidence - left.confidence ||
    Number(right.lastUsedTick) - Number(left.lastUsedTick) ||
    String(left.tileId).localeCompare(String(right.tileId));
}

function comparePlaceMemory(left: PlaceMemoryRecord, right: PlaceMemoryRecord): number {
  return Number(right.isReturnPlace) - Number(left.isReturnPlace) ||
    right.repeatedReturnCount - left.repeatedReturnCount ||
    right.visitCount - left.visitCount ||
    right.confidence - left.confidence ||
    String(left.tileId).localeCompare(String(right.tileId));
}

function compareTrips(left: IntraSeasonTripRecord, right: IntraSeasonTripRecord): number {
  return Number(right.tick) - Number(left.tick) ||
    Number(right.day) - Number(left.day) ||
    makeTripSourceId(left).localeCompare(makeTripSourceId(right));
}

function compareFootholdPlaces(left: CampFootholdPlace, right: CampFootholdPlace): number {
  return statusRank(right.status) - statusRank(left.status) ||
    right.confidence - left.confidence ||
    String(left.tileId).localeCompare(String(right.tileId));
}

function compareFactorDrafts(left: CampFactorDraft, right: CampFactorDraft): number {
  return right.score - left.score ||
    right.confidence - left.confidence ||
    left.family.localeCompare(right.family);
}

function statusRank(status: CampFootholdSignalStatus): number {
  switch (status) {
    case "active":
      return 8;
    case "remembered":
      return 7;
    case "strained":
      return 6;
    case "local_only":
      return 5;
    case "fragile":
      return 4;
    case "weak":
      return 3;
    case "inherited_not_tested_here":
      return 2;
    case "stale":
      return 1;
    case "uncertain":
      return 0;
  }
}

function countByKey<K extends string>(keys: readonly K[], values: readonly K[]): Readonly<Record<K, number>> {
  const counts = keys.reduce<Record<K, number>>((record, key) => {
    record[key] = 0;
    return record;
  }, {} as Record<K, number>);

  for (const value of values) {
    counts[value] = (counts[value] ?? 0) + 1;
  }

  return counts;
}

function maxJsonBytes(values: readonly unknown[]): number {
  return values.reduce<number>((max, value) => Math.max(max, byteLengthUtf8(value)), 0);
}

function byteLengthUtf8(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const value of values) {
    if (value.length === 0 || seen.has(value)) {
      continue;
    }
    seen.add(value);
    unique.push(value);
  }
  return unique;
}

function percent(value: number): string {
  return `${Math.round(clamp01(value) * 100)}%`;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

function severityToNumber(severity: string): number {
  switch (severity) {
    case "major":
      return 0.75;
    case "moderate":
      return 0.5;
    case "minor":
      return 0.25;
    default:
      return 0.2;
  }
}

function makeCampReasonId(bandId: BandId, kind: string, tileId: TileId): ReasonId {
  return `reason:camp-foothold:${String(bandId)}:${kind}:${String(tileId)}` as ReasonId;
}
