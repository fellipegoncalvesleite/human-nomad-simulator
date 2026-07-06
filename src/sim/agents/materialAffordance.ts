import type { BandId, ReasonId, RouteId, TileId } from "../core/types";
import type { NormalizedIntensity } from "../rules/types";
import type { Tile, WorldState } from "../world/types";
import { deriveCanonicalEvents, type CanonicalEvent } from "./eventSystem";
import { deriveKnowledgeEcologyProfile, type KnowledgeEcologyItem } from "./knowledgeEcology";
import type {
  Band,
  IntraSeasonTripRecord,
  IntraSeasonTripTaskGroupType,
  KnownCrossingMemory,
  PlaceMemoryRecord,
  ResidentialMoveEvent,
  TravelCorridorMemory,
} from "./types";
import { effectiveResourceConfidence, type ResourcePatchMemory } from "./resourceKnowledge";
import type { ResourceClassId } from "./resourceClasses";

const AFFORDANCE_ITEM_CAP = 9;
const EVIDENCE_PER_ITEM_CAP = 5;
const BASIS_PER_ITEM_CAP = 4;
const CONSTRAINT_PER_ITEM_CAP = 4;
const FUTURE_HOOK_PER_ITEM_CAP = 4;
const KNOWN_TILE_CONTEXT_CAP = 36;
const RESOURCE_MEMORY_CONTEXT_CAP = 36;
const ACTIVITY_CONTEXT_CAP = 18;
const MEMORY_CONTEXT_CAP = 16;
const SAMPLE_CAP = 12;

export type MaterialAffordanceFamily =
  | "carrying_containers_cordage"
  | "shelter_camp_structure"
  | "fire_hearth_fuel"
  | "food_processing"
  | "water_edge_trapping"
  | "route_crossing_engineering"
  | "tool_cutting_scraping_digging"
  | "visual_mineral_adhesive"
  | "camp_organization_care";

export type MaterialAffordanceStrength = "none" | "weak" | "plausible" | "strong";

export type MaterialAffordanceStatus =
  | "unsupported_by_current_data"
  | "absent"
  | "weak"
  | "plausible"
  | "strong"
  | "blocked_constrained"
  | "future_only";

export type MaterialAffordanceLivedBasis = "lived" | "inherited_not_lived" | "mixed" | "unknown";

export type MaterialAffordanceEvidenceKind =
  | "material"
  | "terrain_hydrography"
  | "knowledge"
  | "activity"
  | "event"
  | "memory"
  | "demography"
  | "seasonal_support"
  | "repetition";

export type MaterialAffordanceSourceSystem =
  | "known_tile"
  | "resource_memory"
  | "knowledge_ecology"
  | "canonical_event"
  | "activity_party"
  | "activity_summary"
  | "place_memory"
  | "route_memory"
  | "crossing_memory"
  | "residential_move"
  | "demography"
  | "seasonal_support"
  | "body_camp_logistics"
  | "foraging_adaptation";

export interface MaterialAffordanceEvidenceRef {
  readonly kind: MaterialAffordanceEvidenceKind;
  readonly sourceSystem: MaterialAffordanceSourceSystem;
  readonly label: string;
  readonly sourceId: string;
  readonly confidence: NormalizedIntensity;
  readonly livedBasis: MaterialAffordanceLivedBasis;
  readonly tileId?: TileId;
  readonly routeId?: RouteId;
  readonly reasonIds: readonly ReasonId[];
}

export interface MaterialAffordanceConstraint {
  readonly label: string;
  readonly severity: NormalizedIntensity;
  readonly sourceSystem: MaterialAffordanceSourceSystem;
}

export interface MaterialAffordanceItem {
  readonly id: string;
  readonly family: MaterialAffordanceFamily;
  readonly publicLabel: string;
  readonly meaning: string;
  readonly strength: MaterialAffordanceStrength;
  readonly status: MaterialAffordanceStatus;
  readonly confidence: NormalizedIntensity;
  readonly materialBasis: readonly string[];
  readonly knowledgeBasis: readonly string[];
  readonly activityEventBasis: readonly string[];
  readonly constraints: readonly MaterialAffordanceConstraint[];
  readonly futureHooks: readonly string[];
  readonly evidence: readonly MaterialAffordanceEvidenceRef[];
  readonly sourceSystems: readonly MaterialAffordanceSourceSystem[];
  readonly livedBasis: MaterialAffordanceLivedBasis;
  readonly livedEvidenceCount: number;
  readonly inheritedEvidenceCount: number;
  readonly possibleOnly: true;
  readonly noPracticeDiscovery: true;
  readonly noSkillGranted: true;
  readonly noDecisionInfluence: true;
}

export interface MaterialAffordanceProfile {
  readonly bandId: BandId;
  readonly generatedAtTick: number;
  readonly generatedAtYear: number;
  readonly projectionMode: "selected_band_projection";
  readonly overviewTitle: string;
  readonly overviewLines: readonly string[];
  readonly items: readonly MaterialAffordanceItem[];
  readonly familiesRepresented: readonly MaterialAffordanceFamily[];
  readonly familyCounts: Readonly<Record<MaterialAffordanceFamily, number>>;
  readonly statusCounts: Readonly<Record<MaterialAffordanceStatus, number>>;
  readonly strengthCounts: Readonly<Record<MaterialAffordanceStrength, number>>;
  readonly sourceSystemCounts: Readonly<Record<MaterialAffordanceSourceSystem, number>>;
  readonly futureHookCounts: Readonly<Record<string, number>>;
  readonly materialBasisCount: number;
  readonly knowledgeBasisCount: number;
  readonly activityEvidenceCount: number;
  readonly eventEvidenceCount: number;
  readonly memoryEvidenceCount: number;
  readonly inheritedBasisCount: number;
  readonly livedBasisCount: number;
  readonly constraintCount: number;
  readonly unsupportedOrDeferredCount: number;
  readonly caps: {
    readonly itemCap: number;
    readonly evidencePerItemCap: number;
    readonly basisPerItemCap: number;
    readonly constraintPerItemCap: number;
    readonly futureHookPerItemCap: number;
    readonly knownTileContextCap: number;
    readonly resourceMemoryContextCap: number;
    readonly capsHeld: boolean;
  };
  readonly integrity: {
    readonly selectedBandOnly: true;
    readonly projectionOnly: true;
    readonly noBehaviorInfluence: true;
    readonly noDecisionInfluence: true;
    readonly noPracticeDiscovery: true;
    readonly noProblemFraming: true;
    readonly noSkillOrAdaptationSystem: true;
    readonly noCultureSystem: true;
    readonly noAgricultureSettlementTerritoryWar: true;
    readonly ignoresLegacyStartingSkills: true;
    readonly inheritedSeparated: boolean;
    readonly daughterAffordanceIsNotPracticedInheritance: boolean;
    readonly evidenceBacked: boolean;
  };
  readonly chronicleIntegration: {
    readonly mode: "inspected_skipped";
    readonly reason: string;
    readonly brokenRenderedLinks: 0;
  };
  readonly technicalProof: {
    readonly payloadBytesEstimate: number;
    readonly maxItemPayloadBytes: number;
    readonly sourceIdSamples: readonly string[];
    readonly eventIdSamples: readonly string[];
    readonly activityTripSamples: readonly string[];
    readonly knownTileContextCount: number;
    readonly resourceMemoryContextCount: number;
    readonly activityPartyEvidenceCount: number;
    readonly legacyStartingSkillProofCount: 0;
    readonly decisionPathIsolation: true;
  };
}

interface AffordanceFamilySpec {
  readonly family: MaterialAffordanceFamily;
  readonly publicLabel: string;
  readonly meaning: string;
  readonly unsupportedMeaning: string;
  readonly futureHooks: readonly string[];
}

interface MaterialAffordanceContext {
  readonly world: WorldState;
  readonly band: Band;
  readonly knowledgeItems: readonly KnowledgeEcologyItem[];
  readonly events: readonly CanonicalEvent[];
  readonly knownTiles: readonly Tile[];
  readonly resourceMemories: readonly ResourcePatchMemory[];
  readonly trips: readonly IntraSeasonTripRecord[];
  readonly moves: readonly ResidentialMoveEvent[];
  readonly places: readonly PlaceMemoryRecord[];
  readonly routes: readonly TravelCorridorMemory[];
  readonly crossings: readonly KnownCrossingMemory[];
}

interface AffordanceDraft {
  readonly family: MaterialAffordanceFamily;
  readonly evidence: readonly MaterialAffordanceEvidenceRef[];
  readonly constraints: readonly MaterialAffordanceConstraint[];
  readonly futureHooks: readonly string[];
}

const FAMILY_ORDER: readonly MaterialAffordanceFamily[] = [
  "carrying_containers_cordage",
  "shelter_camp_structure",
  "fire_hearth_fuel",
  "food_processing",
  "water_edge_trapping",
  "route_crossing_engineering",
  "tool_cutting_scraping_digging",
  "visual_mineral_adhesive",
  "camp_organization_care",
];

const FAMILY_SPECS: Readonly<Record<MaterialAffordanceFamily, AffordanceFamilySpec>> = {
  carrying_containers_cordage: {
    family: "carrying_containers_cordage",
    publicLabel: "Carrying problems have material hints",
    meaning: "Known loads, fiber or wetland material can make later carrying or container experiments plausible.",
    unsupportedMeaning: "Carrying need may exist, but the known material basis is still too thin.",
    futureHooks: ["container questions", "cordage questions", "net or sling questions", "carrying-frame questions"],
  },
  shelter_camp_structure: {
    family: "shelter_camp_structure",
    publicLabel: "Camp work could support shelter routines",
    meaning: "Repeated returns plus brush, wood, reed, stone, or weather pressure can later make camp-structure trials plausible.",
    unsupportedMeaning: "Camp structure remains weak because return, weather, or material evidence is thin.",
    futureHooks: ["windbreak questions", "shade or lean-to questions", "sleeping-surface questions", "temporary camp-improvement questions"],
  },
  fire_hearth_fuel: {
    family: "fire_hearth_fuel",
    publicLabel: "Fuel and hearth choices may matter",
    meaning: "Fuel, camp return, weather, and food-work pressure can later make hearth placement or fuel planning salient.",
    unsupportedMeaning: "Fire remains baseline human competence here; advanced hearth or fuel routines lack enough local evidence.",
    futureHooks: ["hearth placement questions", "fuel planning questions", "ember carrying questions", "smoke or drying questions"],
  },
  food_processing: {
    family: "food_processing",
    publicLabel: "Food work suggests processing questions",
    meaning: "Repeated seed, root, fallback, risky plant, water, or stone context can make later processing experiments plausible.",
    unsupportedMeaning: "Food processing remains weak because repeated food-work or material support is not clear enough.",
    futureHooks: ["pounding or grinding questions", "roasting or drying questions", "soaking or leaching questions", "processing-risk questions"],
  },
  water_edge_trapping: {
    family: "water_edge_trapping",
    publicLabel: "Water-edge work has capture possibilities",
    meaning: "Known aquatic edges, reeds, wood, fishing trips, or wetland food-work can make later water-edge capture trials plausible.",
    unsupportedMeaning: "Water-edge capture remains weak without known water-edge use or flexible material basis.",
    futureHooks: ["water-edge capture questions", "weir or barrier questions", "net or basket-trap questions", "shellfish routine questions"],
  },
  route_crossing_engineering: {
    family: "route_crossing_engineering",
    publicLabel: "Known routes could later be marked or maintained",
    meaning: "Repeated routes, crossings, blocked paths, and carry pressure can make later crossing or route-maintenance trials plausible.",
    unsupportedMeaning: "Route engineering remains weak where route memory, crossing pressure, or suitable material is thin.",
    futureHooks: ["crossing-aid questions", "route marking questions", "trail clearing questions", "seasonal crossing timing questions"],
  },
  tool_cutting_scraping_digging: {
    family: "tool_cutting_scraping_digging",
    publicLabel: "Tool work has raw material hints",
    meaning: "Known stone, wood, bone-like animal work, plant cutting, roots, or camp repair can make later tool-use questions plausible.",
    unsupportedMeaning: "Tool affordance remains weak because stone, wood, hide/meat, or extraction evidence is thin.",
    futureHooks: ["digging-stick questions", "cutting or scraping questions", "hammerstone or anvil questions", "handle or awl questions later"],
  },
  visual_mineral_adhesive: {
    family: "visual_mineral_adhesive",
    publicLabel: "Mineral or adhesive work is only faint",
    meaning: "Known mineral, resin, heat, hide, or wood contexts can later support pigment or adhesive questions.",
    unsupportedMeaning: "The current data has little direct mineral, resin, pigment, or adhesive basis.",
    futureHooks: ["pigment questions", "resin or adhesive questions", "hide or wood treatment questions later"],
  },
  camp_organization_care: {
    family: "camp_organization_care",
    publicLabel: "Camp care and work can be organized",
    meaning: "Dependents, elders, thin labor, repeated camp work, and near-camp food tasks can make later camp-organization routines plausible.",
    unsupportedMeaning: "Care organization remains weak where labor, camp return, and near-camp work are not yet clearly represented.",
    futureHooks: ["stay-behind care questions", "near-camp food-work questions", "sleeping arrangement questions", "repair and maintenance questions"],
  },
};

const EMPTY_FAMILY_COUNTS: Readonly<Record<MaterialAffordanceFamily, number>> = {
  carrying_containers_cordage: 0,
  shelter_camp_structure: 0,
  fire_hearth_fuel: 0,
  food_processing: 0,
  water_edge_trapping: 0,
  route_crossing_engineering: 0,
  tool_cutting_scraping_digging: 0,
  visual_mineral_adhesive: 0,
  camp_organization_care: 0,
};

const EMPTY_STATUS_COUNTS: Readonly<Record<MaterialAffordanceStatus, number>> = {
  unsupported_by_current_data: 0,
  absent: 0,
  weak: 0,
  plausible: 0,
  strong: 0,
  blocked_constrained: 0,
  future_only: 0,
};

const EMPTY_STRENGTH_COUNTS: Readonly<Record<MaterialAffordanceStrength, number>> = {
  none: 0,
  weak: 0,
  plausible: 0,
  strong: 0,
};

const EMPTY_SOURCE_COUNTS: Readonly<Record<MaterialAffordanceSourceSystem, number>> = {
  known_tile: 0,
  resource_memory: 0,
  knowledge_ecology: 0,
  canonical_event: 0,
  activity_party: 0,
  activity_summary: 0,
  place_memory: 0,
  route_memory: 0,
  crossing_memory: 0,
  residential_move: 0,
  demography: 0,
  seasonal_support: 0,
  body_camp_logistics: 0,
  foraging_adaptation: 0,
};

export function deriveMaterialAffordanceProfile(world: WorldState, band: Band): MaterialAffordanceProfile {
  const knowledgeProfile = deriveKnowledgeEcologyProfile(world, band);
  const eventState = deriveCanonicalEvents(world, band);
  const context: MaterialAffordanceContext = {
    world,
    band,
    knowledgeItems: knowledgeProfile.items,
    events: eventState.events,
    knownTiles: selectKnownTiles(world, band),
    resourceMemories: selectResourceMemories(world, band),
    trips: [...(band.recentIntraSeasonTrips ?? [])]
      .sort((left, right) => Number(right.tick) - Number(left.tick) || String(left.targetTileId).localeCompare(String(right.targetTileId)))
      .slice(0, ACTIVITY_CONTEXT_CAP),
    moves: [...(band.recentResidentialMoveEvents ?? [])]
      .sort((left, right) => Number(right.tick) - Number(left.tick) || String(left.eventId).localeCompare(String(right.eventId)))
      .slice(0, ACTIVITY_CONTEXT_CAP),
    places: Object.values(band.placeMemory)
      .sort(comparePlaceMemory)
      .slice(0, MEMORY_CONTEXT_CAP),
    routes: Object.values(band.travelCorridors)
      .sort(compareRouteMemory)
      .slice(0, MEMORY_CONTEXT_CAP),
    crossings: Object.values(band.crossingMemories)
      .sort(compareCrossingMemory)
      .slice(0, MEMORY_CONTEXT_CAP),
  };
  const drafts: readonly AffordanceDraft[] = [
    buildCarryingDraft(context),
    buildShelterDraft(context),
    buildFireDraft(context),
    buildFoodProcessingDraft(context),
    buildWaterEdgeDraft(context),
    buildRouteCrossingDraft(context),
    buildToolDraft(context),
    buildVisualMineralDraft(context),
    buildCampCareDraft(context),
  ];
  const items = drafts
    .map((draft) => finalizeItem(context, draft))
    .sort((left, right) => familyRank(left.family) - familyRank(right.family))
    .slice(0, AFFORDANCE_ITEM_CAP);
  const allEvidence = items.flatMap((item) => item.evidence);
  const familyCounts = countFamilies(items);
  const statusCounts = countStatuses(items);
  const strengthCounts = countStrengths(items);
  const sourceSystemCounts = countSourceSystems(allEvidence);
  const futureHookCounts = countStrings(items.flatMap((item) => item.futureHooks));
  const payloadBytesEstimate = byteLengthUtf8(JSON.stringify({
    bandId: band.id,
    generatedAtTick: world.time.tick,
    items,
  }));
  const itemPayloads = items.map((item) => byteLengthUtf8(JSON.stringify(item)));

  return {
    bandId: band.id,
    generatedAtTick: Number(world.time.tick),
    generatedAtYear: world.time.year,
    projectionMode: "selected_band_projection",
    overviewTitle: buildOverviewTitle(items),
    overviewLines: buildOverviewLines(items),
    items,
    familiesRepresented: FAMILY_ORDER.filter((family) => familyCounts[family] > 0),
    familyCounts,
    statusCounts,
    strengthCounts,
    sourceSystemCounts,
    futureHookCounts,
    materialBasisCount: allEvidence.filter((evidence) => evidence.kind === "material" || evidence.kind === "terrain_hydrography").length,
    knowledgeBasisCount: allEvidence.filter((evidence) => evidence.kind === "knowledge").length,
    activityEvidenceCount: allEvidence.filter((evidence) => evidence.kind === "activity").length,
    eventEvidenceCount: allEvidence.filter((evidence) => evidence.kind === "event").length,
    memoryEvidenceCount: allEvidence.filter((evidence) => evidence.kind === "memory" || evidence.kind === "repetition").length,
    inheritedBasisCount: allEvidence.filter((evidence) => evidence.livedBasis === "inherited_not_lived").length,
    livedBasisCount: allEvidence.filter((evidence) => evidence.livedBasis === "lived" || evidence.livedBasis === "mixed").length,
    constraintCount: items.reduce((sum, item) => sum + item.constraints.length, 0),
    unsupportedOrDeferredCount: items.filter((item) =>
      item.status === "unsupported_by_current_data" ||
      item.status === "absent" ||
      item.status === "future_only" ||
      item.status === "blocked_constrained").length,
    caps: {
      itemCap: AFFORDANCE_ITEM_CAP,
      evidencePerItemCap: EVIDENCE_PER_ITEM_CAP,
      basisPerItemCap: BASIS_PER_ITEM_CAP,
      constraintPerItemCap: CONSTRAINT_PER_ITEM_CAP,
      futureHookPerItemCap: FUTURE_HOOK_PER_ITEM_CAP,
      knownTileContextCap: KNOWN_TILE_CONTEXT_CAP,
      resourceMemoryContextCap: RESOURCE_MEMORY_CONTEXT_CAP,
      capsHeld: items.length <= AFFORDANCE_ITEM_CAP && items.every((item) =>
        item.evidence.length <= EVIDENCE_PER_ITEM_CAP &&
        item.materialBasis.length <= BASIS_PER_ITEM_CAP &&
        item.knowledgeBasis.length <= BASIS_PER_ITEM_CAP &&
        item.activityEventBasis.length <= BASIS_PER_ITEM_CAP &&
        item.constraints.length <= CONSTRAINT_PER_ITEM_CAP &&
        item.futureHooks.length <= FUTURE_HOOK_PER_ITEM_CAP),
    },
    integrity: {
      selectedBandOnly: true,
      projectionOnly: true,
      noBehaviorInfluence: true,
      noDecisionInfluence: true,
      noPracticeDiscovery: true,
      noProblemFraming: true,
      noSkillOrAdaptationSystem: true,
      noCultureSystem: true,
      noAgricultureSettlementTerritoryWar: true,
      ignoresLegacyStartingSkills: true,
      inheritedSeparated: items.every((item) => item.inheritedEvidenceCount === 0 || item.livedBasis !== "unknown"),
      daughterAffordanceIsNotPracticedInheritance: band.parentBandId === undefined ||
        items.every((item) => item.inheritedEvidenceCount === 0 || item.status === "future_only" || item.livedEvidenceCount > 0),
      evidenceBacked: items.every((item) => item.evidence.length > 0 || item.status === "unsupported_by_current_data" || item.status === "absent"),
    },
    chronicleIntegration: {
      mode: "inspected_skipped",
      reason: "Chronicle pages are already dense; this pass keeps affordance evidence in the Affordances and Technical tabs and adds no new Chronicle prose.",
      brokenRenderedLinks: 0,
    },
    technicalProof: {
      payloadBytesEstimate,
      maxItemPayloadBytes: Math.max(0, ...itemPayloads),
      sourceIdSamples: capStrings(allEvidence.map((evidence) => evidence.sourceId), SAMPLE_CAP),
      eventIdSamples: capStrings(allEvidence.filter((evidence) => evidence.sourceSystem === "canonical_event").map((evidence) => evidence.sourceId), SAMPLE_CAP),
      activityTripSamples: capStrings(allEvidence.filter((evidence) => evidence.sourceSystem === "activity_party").map((evidence) => evidence.sourceId), SAMPLE_CAP),
      knownTileContextCount: context.knownTiles.length,
      resourceMemoryContextCount: context.resourceMemories.length,
      activityPartyEvidenceCount: allEvidence.filter((evidence) => evidence.sourceSystem === "activity_party").length,
      legacyStartingSkillProofCount: 0,
      decisionPathIsolation: true,
    },
  };
}

function buildCarryingDraft(context: MaterialAffordanceContext): AffordanceDraft {
  const evidence: MaterialAffordanceEvidenceRef[] = [];
  const constraints: MaterialAffordanceConstraint[] = [];
  addFirstResourceEvidence(context, evidence, ["fiber_material"], "remembered fiber or reed material", "material");
  addFirstResourceEvidence(context, evidence, ["generic_plant_food", "fallback_food"], "gathered food loads repeat", "material");
  addTripEvidence(context, evidence, ["plant_gathering_group", "local_foraging_group", "plant_followup_group"], "recent gathering or plant follow-up loads");
  addActivitySummaryEvidence(context, evidence, "activity returns create carrying and sorting questions");
  addKnowledgeEvidence(context, evidence, ["food_work", "place_country"], "food work and familiar places frame carrying needs");
  addRepetitionEvidence(context, evidence, ["fiber_handling", "food_processing", "food_work"], "repetition makes handling visible without proving skill");
  addDemographyEvidence(context, evidence, dependencyLoad(context.band), 0.34, "dependents and elders raise carrying pressure");

  if (!hasResourceClass(context, "fiber_material")) {
    constraints.push(makeConstraint("little direct fiber or reed memory in known country", 0.66, "resource_memory"));
  }
  if (dependencyLoad(context.band) >= 0.42) {
    constraints.push(makeConstraint("high carrying burden can expose need before material answers exist", 0.45, "demography"));
  }

  return { family: "carrying_containers_cordage", evidence, constraints, futureHooks: FAMILY_SPECS.carrying_containers_cordage.futureHooks };
}

function buildShelterDraft(context: MaterialAffordanceContext): AffordanceDraft {
  const evidence: MaterialAffordanceEvidenceRef[] = [];
  const constraints: MaterialAffordanceConstraint[] = [];
  addTerrainEvidence(context, evidence, isWoodOrBrushTile, "known wood, brush, or reed country");
  addFirstResourceEvidence(context, evidence, ["fuel_material", "fiber_material"], "remembered flexible camp material", "material");
  addPlaceEvidence(context, evidence, "repeated camp return gives setup context");
  addKnowledgeEvidence(context, evidence, ["place_country", "water_refuge"], "known places and refuge memory guide camp setup");
  addEventEvidence(context, evidence, ["movement_place", "food_water_pressure"], "moves or stress make camp setup noticeable");
  addBodyCampEvidence(context, evidence, "weather or material wear is already visible");

  if (maxRepeatedReturn(context) < 3) {
    constraints.push(makeConstraint("few repeated returns make shelter routines less grounded", 0.52, "place_memory"));
  }
  if (!hasWoodBrushOrFiber(context)) {
    constraints.push(makeConstraint("known material basis for structure is weak", 0.6, "known_tile"));
  }

  return { family: "shelter_camp_structure", evidence, constraints, futureHooks: FAMILY_SPECS.shelter_camp_structure.futureHooks };
}

function buildFireDraft(context: MaterialAffordanceContext): AffordanceDraft {
  const evidence: MaterialAffordanceEvidenceRef[] = [];
  const constraints: MaterialAffordanceConstraint[] = [];
  addFirstResourceEvidence(context, evidence, ["fuel_material"], "remembered fuel material", "material");
  addTerrainEvidence(context, evidence, isFuelTile, "known wood or dry fuel context");
  addPlaceEvidence(context, evidence, "repeated camp return can make hearth placement matter");
  addKnowledgeEvidence(context, evidence, ["food_work", "water_refuge", "place_country"], "food work and refuge knowledge give fire context");
  addBodyCampEvidence(context, evidence, "fire, weather, or material wear is tracked");
  addSeasonalEvidence(context, evidence, "wet, cold, or deficit seasons make fire reliability salient");

  if (!hasResourceClass(context, "fuel_material") && !context.knownTiles.some(isFuelTile)) {
    constraints.push(makeConstraint("fuel basis is inferred from terrain rather than direct fuel memory", 0.56, "known_tile"));
  }
  constraints.push(makeConstraint("basic fire is assumed human competence; this is only a hook for later advanced routines", 0.34, "body_camp_logistics"));

  return { family: "fire_hearth_fuel", evidence, constraints, futureHooks: FAMILY_SPECS.fire_hearth_fuel.futureHooks };
}

function buildFoodProcessingDraft(context: MaterialAffordanceContext): AffordanceDraft {
  const evidence: MaterialAffordanceEvidenceRef[] = [];
  const constraints: MaterialAffordanceConstraint[] = [];
  addFirstProcessingResourceEvidence(context, evidence);
  addFirstResourceEvidence(context, evidence, ["water_resource"], "water basis could matter for soaking or leaching", "terrain_hydrography");
  addTerrainEvidence(context, evidence, isStoneTile, "known stone or hard-ground context");
  addTripEvidence(context, evidence, ["plant_gathering_group", "plant_followup_group", "local_foraging_group"], "repeated plant or local food work");
  addActivitySummaryEvidence(context, evidence, "food-work outcomes preserve processing questions");
  addKnowledgeEvidence(context, evidence, ["food_work", "risk_caution"], "food knowledge separates usable, risky, and uncertain work");
  addRepetitionEvidence(context, evidence, ["food_processing", "food_work"], "repetition preserves processing questions without method knowledge");

  if (!hasProcessingResource(context)) {
    constraints.push(makeConstraint("no clear seed, root, risky plant, or fallback processing memory", 0.62, "resource_memory"));
  }
  if (!context.knownTiles.some(isStoneTile)) {
    constraints.push(makeConstraint("stone, hammer, or anvil basis is not strongly represented", 0.48, "known_tile"));
  }

  return { family: "food_processing", evidence, constraints, futureHooks: FAMILY_SPECS.food_processing.futureHooks };
}

function buildWaterEdgeDraft(context: MaterialAffordanceContext): AffordanceDraft {
  const evidence: MaterialAffordanceEvidenceRef[] = [];
  const constraints: MaterialAffordanceConstraint[] = [];
  addTerrainEvidence(context, evidence, isWaterEdgeTile, "known river, lake, wetland, coast, or creek edge");
  addFirstResourceEvidence(context, evidence, ["aquatic_food", "water_resource", "fiber_material"], "aquatic, water, or reed-like resource memory", "material");
  addTripEvidence(context, evidence, ["fishing_group", "water_group", "plant_gathering_group"], "water-edge or fishing activity parties");
  addActivitySummaryEvidence(context, evidence, "water or food returns make capture questions visible");
  addKnowledgeEvidence(context, evidence, ["water_refuge", "food_work", "crossing"], "water and crossing knowledge frames water-edge work");
  addEventEvidence(context, evidence, ["food_water_pressure", "route_crossing"], "water pressure or crossing events are remembered");

  if (!context.knownTiles.some(isWaterEdgeTile) && !hasResourceClass(context, "aquatic_food")) {
    constraints.push(makeConstraint("no strong known water-edge food or shoreline basis", 0.72, "known_tile"));
  }
  if (!hasResourceClass(context, "fiber_material")) {
    constraints.push(makeConstraint("flexible reed or fiber basis for traps or nets is weak", 0.5, "resource_memory"));
  }

  return { family: "water_edge_trapping", evidence, constraints, futureHooks: FAMILY_SPECS.water_edge_trapping.futureHooks };
}

function buildRouteCrossingDraft(context: MaterialAffordanceContext): AffordanceDraft {
  const evidence: MaterialAffordanceEvidenceRef[] = [];
  const constraints: MaterialAffordanceConstraint[] = [];
  addRouteEvidence(context, evidence, "used routes give wayfinding context");
  addCrossingEvidence(context, evidence, "known crossings create pressure without creating bridges or boats");
  addMoveEvidence(context, evidence, "recent residential moves expose route problems");
  addKnowledgeEvidence(context, evidence, ["route_corridor", "crossing", "place_country"], "route and crossing knowledge carry the practical map");
  addEventEvidence(context, evidence, ["route_crossing", "movement_place"], "route or move events make blocked paths visible");
  addRepetitionEvidence(context, evidence, ["crossing", "route_use"], "repeated route use remains familiarity, not a solved method");

  if (context.routes.length === 0 && context.crossings.length === 0) {
    constraints.push(makeConstraint("little direct route or crossing memory", 0.68, "route_memory"));
  }
  if (context.crossings.some((crossing) => crossing.riskMemory >= 0.55)) {
    constraints.push(makeConstraint("risky crossings may create false confidence or dead-end attempts", 0.58, "crossing_memory"));
  }

  return { family: "route_crossing_engineering", evidence, constraints, futureHooks: FAMILY_SPECS.route_crossing_engineering.futureHooks };
}

function buildToolDraft(context: MaterialAffordanceContext): AffordanceDraft {
  const evidence: MaterialAffordanceEvidenceRef[] = [];
  const constraints: MaterialAffordanceConstraint[] = [];
  addTerrainEvidence(context, evidence, isStoneTile, "known stone, riverbank, hill, or mountain context");
  addTerrainEvidence(context, evidence, isWoodOrBrushTile, "known wood or brush context");
  addFirstResourceEvidence(context, evidence, ["fuel_material", "fiber_material", "animal_food", "fallback_food"], "material or extraction work is remembered", "material");
  addTripEvidence(context, evidence, ["plant_gathering_group", "hunting_group", "local_foraging_group"], "cutting, digging, or tracking work may be recurring");
  addKnowledgeEvidence(context, evidence, ["food_work", "risk_caution"], "food and risk knowledge point to practical handling problems");
  addBodyCampEvidence(context, evidence, "material wear or camp logistics expose repair needs");

  if (!context.knownTiles.some(isStoneTile)) {
    constraints.push(makeConstraint("stone or hard-tool context is weak in known country", 0.55, "known_tile"));
  }
  if (!hasAnyResourceClass(context, ["animal_food", "fallback_food", "fuel_material", "fiber_material"])) {
    constraints.push(makeConstraint("little grounded extraction or material-handling evidence", 0.52, "resource_memory"));
  }

  return { family: "tool_cutting_scraping_digging", evidence, constraints, futureHooks: FAMILY_SPECS.tool_cutting_scraping_digging.futureHooks };
}

function buildVisualMineralDraft(context: MaterialAffordanceContext): AffordanceDraft {
  const evidence: MaterialAffordanceEvidenceRef[] = [];
  const constraints: MaterialAffordanceConstraint[] = [];
  addTerrainEvidence(context, evidence, isMineralHintTile, "hills, mountains, desert, or stone country can hint at mineral work");
  addFirstResourceEvidence(context, evidence, ["fuel_material", "animal_food"], "heat, wood, or hide-like work may matter later", "material");
  addKnowledgeEvidence(context, evidence, ["risk_caution", "food_work"], "handling caution may later matter for pigments or adhesives");
  addBodyCampEvidence(context, evidence, "fire or material wear can make treatment questions visible");

  if (!context.knownTiles.some(isMineralHintTile)) {
    constraints.push(makeConstraint("no direct mineral, ochre, or pigment resource exists in the current data", 0.86, "known_tile"));
  }
  constraints.push(makeConstraint("adhesive and symbolic uses are deferred; current profile keeps this faint", 0.7, "resource_memory"));

  return { family: "visual_mineral_adhesive", evidence, constraints, futureHooks: FAMILY_SPECS.visual_mineral_adhesive.futureHooks };
}

function buildCampCareDraft(context: MaterialAffordanceContext): AffordanceDraft {
  const evidence: MaterialAffordanceEvidenceRef[] = [];
  const constraints: MaterialAffordanceConstraint[] = [];
  addDemographyEvidence(context, evidence, dependencyLoad(context.band), 0.28, "dependents and elders create care pressure");
  addPlaceEvidence(context, evidence, "repeated return gives a camp-work setting");
  addTripEvidence(context, evidence, ["local_foraging_group", "plant_gathering_group", "water_group"], "near-camp work can be organized around daily parties");
  addMoveEvidence(context, evidence, "moves create post-arrival setup work");
  addKnowledgeEvidence(context, evidence, ["place_country", "food_work", "water_refuge"], "known places and food work shape camp routines");
  addBodyCampEvidence(context, evidence, "care, cleanliness, sharing, or logistics are already tracked");

  if (dependencyLoad(context.band) < 0.24 && context.band.demography.workingAdults >= context.band.demography.dependents) {
    constraints.push(makeConstraint("care burden is present but not unusually high", 0.36, "demography"));
  }
  if (maxRepeatedReturn(context) < 2) {
    constraints.push(makeConstraint("few repeated camp returns limit organization evidence", 0.52, "place_memory"));
  }

  return { family: "camp_organization_care", evidence, constraints, futureHooks: FAMILY_SPECS.camp_organization_care.futureHooks };
}

function finalizeItem(context: MaterialAffordanceContext, draft: AffordanceDraft): MaterialAffordanceItem {
  const spec = FAMILY_SPECS[draft.family];
  const evidence = capEvidence(draft.evidence);
  const constraints = capConstraints(draft.constraints);
  const sourceSystems = capStrings(evidence.map((entry) => entry.sourceSystem), SAMPLE_CAP) as MaterialAffordanceSourceSystem[];
  const materialBasis = capStrings(evidence
    .filter((entry) => entry.kind === "material" || entry.kind === "terrain_hydrography")
    .map((entry) => entry.label), BASIS_PER_ITEM_CAP);
  const knowledgeBasis = capStrings(evidence
    .filter((entry) => entry.kind === "knowledge" || entry.kind === "memory" || entry.kind === "repetition")
    .map((entry) => entry.label), BASIS_PER_ITEM_CAP);
  const activityEventBasis = capStrings(evidence
    .filter((entry) => entry.kind === "activity" || entry.kind === "event" || entry.kind === "demography" || entry.kind === "seasonal_support")
    .map((entry) => entry.label), BASIS_PER_ITEM_CAP);
  const livedEvidenceCount = evidence.filter((entry) => entry.livedBasis === "lived" || entry.livedBasis === "mixed").length;
  const inheritedEvidenceCount = evidence.filter((entry) => entry.livedBasis === "inherited_not_lived").length;
  const score = scoreAffordance(evidence, constraints);
  const inheritedOnly = evidence.length > 0 && livedEvidenceCount === 0 && inheritedEvidenceCount > 0;
  const noMaterial = materialBasis.length === 0;
  const severeConstraint = constraints.some((constraint) => constraint.severity >= 0.68);
  const strength = strengthFromScore(score, noMaterial);
  const status = statusFromScore(score, evidence.length, noMaterial, severeConstraint, inheritedOnly);
  const confidence = inheritedOnly ? round2(score * 0.72) : round2(score);
  const livedBasis = deriveLivedBasis(livedEvidenceCount, inheritedEvidenceCount);

  return {
    id: `material-affordance:${String(context.band.id)}:${draft.family}`,
    family: draft.family,
    publicLabel: spec.publicLabel,
    meaning: status === "unsupported_by_current_data" || status === "absent" ? spec.unsupportedMeaning : spec.meaning,
    strength,
    status,
    confidence,
    materialBasis,
    knowledgeBasis,
    activityEventBasis,
    constraints,
    futureHooks: capStrings(draft.futureHooks, FUTURE_HOOK_PER_ITEM_CAP),
    evidence,
    sourceSystems,
    livedBasis,
    livedEvidenceCount,
    inheritedEvidenceCount,
    possibleOnly: true,
    noPracticeDiscovery: true,
    noSkillGranted: true,
    noDecisionInfluence: true,
  };
}

function selectKnownTiles(world: WorldState, band: Band): readonly Tile[] {
  return Object.values(band.knowledge.observedTiles)
    .sort((left, right) =>
      (right.visits ?? 0) - (left.visits ?? 0) ||
      (right.confidence ?? 0) - (left.confidence ?? 0) ||
      String(left.tileId).localeCompare(String(right.tileId)))
    .slice(0, KNOWN_TILE_CONTEXT_CAP)
    .map((record) => world.tiles[record.tileId])
    .filter((tile): tile is Tile => tile !== undefined);
}

function selectResourceMemories(world: WorldState, band: Band): readonly ResourcePatchMemory[] {
  return [...(band.resourceKnowledgeState?.patchMemories ?? [])]
    .sort((left, right) => {
      const leftConfidence = effectiveResourceConfidence(left, Number(world.time.tick)).effectivePresenceConfidence;
      const rightConfidence = effectiveResourceConfidence(right, Number(world.time.tick)).effectivePresenceConfidence;
      return (
        rightConfidence - leftConfidence ||
        right.useHistory.visits - left.useHistory.visits ||
        String(left.patchId).localeCompare(String(right.patchId))
      );
    })
    .slice(0, RESOURCE_MEMORY_CONTEXT_CAP);
}

function addFirstResourceEvidence(
  context: MaterialAffordanceContext,
  evidence: MaterialAffordanceEvidenceRef[],
  classIds: readonly ResourceClassId[],
  label: string,
  kind: MaterialAffordanceEvidenceKind,
): void {
  const memory = context.resourceMemories.find((entry) => classIds.includes(entry.resourceClassId));
  if (memory === undefined) {
    return;
  }
  const confidence = effectiveResourceConfidence(memory, Number(context.world.time.tick));
  evidence.push({
    kind,
    sourceSystem: "resource_memory",
    label,
    sourceId: String(memory.patchId),
    confidence: round2(Math.max(confidence.effectivePresenceConfidence, confidence.effectiveAccessConfidence)),
    livedBasis: memory.source === "inherited" || memory.transmission.inheritedFromParent === true ? "inherited_not_lived" : "lived",
    tileId: memory.approximateTile,
    routeId: memory.linkedCorridorId,
    reasonIds: memory.reasonIds.slice(0, 3),
  });
}

function addFirstProcessingResourceEvidence(context: MaterialAffordanceContext, evidence: MaterialAffordanceEvidenceRef[]): void {
  const memory = context.resourceMemories.find((entry) =>
    entry.resourceClassId === "generic_plant_food" ||
    entry.resourceClassId === "fallback_food" ||
    entry.resourceClassId === "medicinal_or_toxic" ||
    entry.plantObservation?.suspectedProcessingNeed === true ||
    entry.confidence.processingConfidence >= 0.16 ||
    entry.useHistory.lastYieldEstimate < 0.18);
  if (memory === undefined) {
    return;
  }
  const confidence = effectiveResourceConfidence(memory, Number(context.world.time.tick));
  evidence.push({
    kind: "material",
    sourceSystem: "resource_memory",
    label: "remembered plant, fallback, or risky food processing question",
    sourceId: String(memory.patchId),
    confidence: round2(Math.max(confidence.effectiveProcessingConfidence, confidence.effectivePresenceConfidence * 0.72)),
    livedBasis: memory.source === "inherited" || memory.transmission.inheritedFromParent === true ? "inherited_not_lived" : "lived",
    tileId: memory.approximateTile,
    reasonIds: memory.reasonIds.slice(0, 3),
  });
}

function addTerrainEvidence(
  context: MaterialAffordanceContext,
  evidence: MaterialAffordanceEvidenceRef[],
  predicate: (tile: Tile) => boolean,
  label: string,
): void {
  const tile = context.knownTiles.find(predicate);
  if (tile === undefined) {
    return;
  }
  evidence.push({
    kind: "terrain_hydrography",
    sourceSystem: "known_tile",
    label,
    sourceId: String(tile.id),
    confidence: 0.62,
    livedBasis: "lived",
    tileId: tile.id,
    reasonIds: [`reason:material-affordance:${String(context.band.id)}:${String(tile.id)}:known-tile` as ReasonId],
  });
}

function addTripEvidence(
  context: MaterialAffordanceContext,
  evidence: MaterialAffordanceEvidenceRef[],
  taskTypes: readonly IntraSeasonTripTaskGroupType[],
  label: string,
): void {
  const trip = context.trips.find((entry) => taskTypes.includes(entry.taskGroupType));
  if (trip === undefined) {
    return;
  }
  evidence.push({
    kind: "activity",
    sourceSystem: "activity_party",
    label,
    sourceId: `${String(trip.sourceBandId)}:${Number(trip.tick)}:${trip.taskGroupType}:${String(trip.targetTileId)}`,
    confidence: activityConfidence(trip),
    livedBasis: "lived",
    tileId: trip.targetTileId,
    reasonIds: trip.reasonIds.slice(0, 3),
  });
}

function addActivitySummaryEvidence(
  context: MaterialAffordanceContext,
  evidence: MaterialAffordanceEvidenceRef[],
  label: string,
): void {
  const summary = context.band.activityOutcomeSummary;
  if (summary !== undefined) {
    const activitySignal = summary.successCount + summary.partialCount + summary.failedCount + summary.informationCount;
    const returnSignal = summary.returnsByResourceKind.reduce((sum, entry) => sum + entry.count, 0);
    if (activitySignal + returnSignal <= 0) {
      return;
    }
    evidence.push({
      kind: "activity",
      sourceSystem: "activity_summary",
      label,
      sourceId: `${String(summary.bandId)}:${Number(summary.tick)}:${String(summary.day)}:activity-summary`,
      confidence: round2(Math.min(0.86, activitySignal / 10 + returnSignal / 16 + summary.maxEstimatedReturnValue * 0.2)),
      livedBasis: "lived",
      reasonIds: [`reason:material-affordance:${String(context.band.id)}:${Number(summary.tick)}:activity-summary` as ReasonId],
    });
    return;
  }

  const labor = context.band.activityLaborSummary;
  if (labor === undefined || labor.activeActivityGroupCount <= 0) {
    return;
  }
  const latest = labor.latestActivityGroupSummary;
  evidence.push({
    kind: "activity",
    sourceSystem: "activity_summary",
    label,
    sourceId: `${String(labor.bandId)}:${Number(labor.tick)}:${String(labor.day)}:activity-labor-summary`,
    confidence: round2(Math.min(0.82, labor.activeActivityGroupCount / 6 + labor.peopleAssignedToActivityGroups / Math.max(1, labor.workingAdults) * 0.28)),
    livedBasis: "lived",
    tileId: latest?.targetTileId,
    reasonIds: latest?.sourceTripReasonIds.slice(0, 3) ?? [`reason:material-affordance:${String(context.band.id)}:${Number(labor.tick)}:activity-labor-summary` as ReasonId],
  });
}

function addKnowledgeEvidence(
  context: MaterialAffordanceContext,
  evidence: MaterialAffordanceEvidenceRef[],
  domains: readonly KnowledgeEcologyItem["domain"][],
  label: string,
): void {
  const item = context.knowledgeItems.find((entry) => domains.includes(entry.domain));
  if (item === undefined) {
    return;
  }
  evidence.push({
    kind: "knowledge",
    sourceSystem: "knowledge_ecology",
    label,
    sourceId: item.id,
    confidence: round2(item.confidence),
    livedBasis: item.livedStatus === "inherited_not_personally_lived" ? "inherited_not_lived" : "lived",
    tileId: item.involvedTileIds[0],
    routeId: item.involvedRouteIds[0],
    reasonIds: item.evidence.flatMap((entry) => entry.reasonIds).slice(0, 3),
  });
}

function addEventEvidence(
  context: MaterialAffordanceContext,
  evidence: MaterialAffordanceEvidenceRef[],
  families: readonly CanonicalEvent["family"][],
  label: string,
): void {
  const event = context.events.find((entry) => families.includes(entry.family));
  if (event === undefined) {
    return;
  }
  evidence.push({
    kind: "event",
    sourceSystem: "canonical_event",
    label,
    sourceId: event.id,
    confidence: round2(Math.max(0.28, Math.min(0.9, event.significance))),
    livedBasis: event.livedStatus === "inherited_not_personally_lived" ? "inherited_not_lived" : "lived",
    tileId: event.involvedTileIds[0],
    routeId: event.involvedRouteIds[0],
    reasonIds: event.sourceReasonIds.slice(0, 3),
  });
}

function addPlaceEvidence(context: MaterialAffordanceContext, evidence: MaterialAffordanceEvidenceRef[], label: string): void {
  const place = context.places.find((entry) => entry.repeatedReturnCount >= 2 || entry.visitCount >= 4);
  if (place === undefined) {
    return;
  }
  evidence.push({
    kind: "memory",
    sourceSystem: "place_memory",
    label,
    sourceId: String(place.tileId),
    confidence: round2(Math.max(place.confidence, Math.min(0.9, place.repeatedReturnCount / 8))),
    livedBasis: "lived",
    tileId: place.tileId,
    reasonIds: place.reasonIds.slice(0, 3),
  });
}

function addRouteEvidence(context: MaterialAffordanceContext, evidence: MaterialAffordanceEvidenceRef[], label: string): void {
  const route = context.routes[0];
  if (route === undefined) {
    return;
  }
  evidence.push({
    kind: "memory",
    sourceSystem: "route_memory",
    label,
    sourceId: String(route.id),
    confidence: round2(Math.max(route.confidence, Math.min(0.88, route.useCount / 8))),
    livedBasis: "lived",
    tileId: route.toTileId,
    routeId: route.id,
    reasonIds: [`reason:material-affordance:${String(context.band.id)}:${String(route.id)}:route-memory` as ReasonId],
  });
}

function addCrossingEvidence(context: MaterialAffordanceContext, evidence: MaterialAffordanceEvidenceRef[], label: string): void {
  const crossing = context.crossings[0];
  if (crossing === undefined) {
    return;
  }
  evidence.push({
    kind: "memory",
    sourceSystem: "crossing_memory",
    label,
    sourceId: `${String(crossing.crossingTileA)}:${String(crossing.crossingTileB)}`,
    confidence: round2(Math.max(crossing.successConfidence, Math.min(0.88, crossing.useCount / 8))),
    livedBasis: "lived",
    tileId: crossing.crossingTileA,
    reasonIds: crossing.reasonIds.slice(0, 3),
  });
}

function addMoveEvidence(context: MaterialAffordanceContext, evidence: MaterialAffordanceEvidenceRef[], label: string): void {
  const move = context.moves[0];
  if (move === undefined) {
    return;
  }
  evidence.push({
    kind: "activity",
    sourceSystem: "residential_move",
    label,
    sourceId: String(move.eventId),
    confidence: round2(move.confidence),
    livedBasis: "lived",
    tileId: move.toTileId,
    reasonIds: move.reasonIds.slice(0, 3),
  });
}

function addDemographyEvidence(
  context: MaterialAffordanceContext,
  evidence: MaterialAffordanceEvidenceRef[],
  value: number,
  threshold: number,
  label: string,
): void {
  if (value < threshold) {
    return;
  }
  evidence.push({
    kind: "demography",
    sourceSystem: "demography",
    label,
    sourceId: `demography:${String(context.band.id)}`,
    confidence: round2(value),
    livedBasis: "lived",
    reasonIds: context.band.demography.lastPopulationChangeReasonIds.slice(0, 3),
  });
}

function addSeasonalEvidence(context: MaterialAffordanceContext, evidence: MaterialAffordanceEvidenceRef[], label: string): void {
  const support = context.band.seasonalSupport;
  if (support === undefined) {
    return;
  }
  const signal = Math.max(
    support.currentSeasonSupport.waterStress,
    support.currentSeasonSupport.deficitRatio,
    support.waterStressSeasonsLast8 / 8,
    support.deficitSeasonsLast8 / 8,
  );
  if (signal < 0.22) {
    return;
  }
  evidence.push({
    kind: "seasonal_support",
    sourceSystem: "seasonal_support",
    label,
    sourceId: `seasonal-support:${String(context.band.id)}:${Number(support.lastUpdatedTick)}`,
    confidence: round2(signal),
    livedBasis: "lived",
    reasonIds: support.reasonIds.slice(0, 3),
  });
}

function addBodyCampEvidence(context: MaterialAffordanceContext, evidence: MaterialAffordanceEvidenceRef[], label: string): void {
  const logistics = context.band.bodyCampLogistics;
  if (logistics === undefined) {
    return;
  }
  const careBurden = Math.max(
    logistics.careTravelBurden.dependentCarryBurden,
    logistics.careTravelBurden.elderTravelCaution,
    logistics.careTravelBurden.pregnancyNursingBurden,
    logistics.careTravelBurden.sickCareBurden,
    logistics.careTravelBurden.wholeBandCrossingBurden,
    logistics.careTravelBurden.longMoveBurden,
    logistics.careTravelBurden.coldHeatVulnerability,
    1 - logistics.careTravelBurden.adultLaborAvailable,
  );
  const firePressure = Math.max(logistics.fire.need, logistics.fire.fuelPressure, logistics.fire.laborCost, logistics.fire.fireRisk);
  const hasSignal =
    logistics.weatherMemories.length > 0 ||
    logistics.materialWear.length > 0 ||
    logistics.seasonalTasks.length > 0 ||
    careBurden > 0.18 ||
    firePressure > 0.28;
  if (!hasSignal) {
    return;
  }
  evidence.push({
    kind: "memory",
    sourceSystem: "body_camp_logistics",
    label,
    sourceId: `body-camp-logistics:${String(context.band.id)}:${Number(logistics.lastUpdatedTick)}`,
    confidence: round2(Math.max(
      careBurden,
      firePressure,
      Math.min(0.78, (logistics.weatherMemories.length + logistics.materialWear.length + logistics.seasonalTasks.length) / 8),
    )),
    livedBasis: "lived",
    reasonIds: logistics.reasonIds.slice(0, 3),
  });
}

function addRepetitionEvidence(
  context: MaterialAffordanceContext,
  evidence: MaterialAffordanceEvidenceRef[],
  domains: readonly string[],
  label: string,
): void {
  const repetition = context.band.foragingAdaptation?.repetitionAffordances.find((entry) => domains.includes(entry.domain));
  if (repetition === undefined) {
    return;
  }
  evidence.push({
    kind: "repetition",
    sourceSystem: "foraging_adaptation",
    label,
    sourceId: repetition.id,
    confidence: round2(Math.min(0.82, (repetition.repeatedExposureCount + repetition.repeatedAttemptSignal) / 18)),
    livedBasis: "lived",
    reasonIds: repetition.reasonIds.slice(0, 3),
  });
}

function capEvidence(evidence: readonly MaterialAffordanceEvidenceRef[]): readonly MaterialAffordanceEvidenceRef[] {
  const seen = new Set<string>();
  const result: MaterialAffordanceEvidenceRef[] = [];

  for (const entry of [...evidence].sort(compareEvidence)) {
    const key = `${entry.kind}:${entry.sourceSystem}:${entry.sourceId}:${entry.label}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push({
      ...entry,
      reasonIds: entry.reasonIds.slice(0, 3),
    });
    if (result.length >= EVIDENCE_PER_ITEM_CAP) {
      break;
    }
  }

  return result;
}

function capConstraints(constraints: readonly MaterialAffordanceConstraint[]): readonly MaterialAffordanceConstraint[] {
  return [...constraints]
    .sort((left, right) => right.severity - left.severity || left.label.localeCompare(right.label))
    .slice(0, CONSTRAINT_PER_ITEM_CAP);
}

function compareEvidence(left: MaterialAffordanceEvidenceRef, right: MaterialAffordanceEvidenceRef): number {
  return (
    evidenceKindRank(left.kind) - evidenceKindRank(right.kind) ||
    right.confidence - left.confidence ||
    left.label.localeCompare(right.label) ||
    left.sourceId.localeCompare(right.sourceId)
  );
}

function evidenceKindRank(kind: MaterialAffordanceEvidenceKind): number {
  switch (kind) {
    case "material":
      return 1;
    case "terrain_hydrography":
      return 2;
    case "knowledge":
      return 3;
    case "activity":
      return 4;
    case "event":
      return 5;
    case "memory":
      return 6;
    case "repetition":
      return 7;
    case "demography":
      return 8;
    case "seasonal_support":
      return 9;
  }
}

function scoreAffordance(
  evidence: readonly MaterialAffordanceEvidenceRef[],
  constraints: readonly MaterialAffordanceConstraint[],
): number {
  const evidenceScore = evidence.reduce((sum, entry) => sum + evidenceWeight(entry.kind) * entry.confidence, 0);
  const constraintDrag = constraints.reduce((sum, entry) => sum + entry.severity * 0.08, 0);
  return clamp01(evidenceScore - constraintDrag);
}

function evidenceWeight(kind: MaterialAffordanceEvidenceKind): number {
  switch (kind) {
    case "material":
      return 0.24;
    case "terrain_hydrography":
      return 0.2;
    case "knowledge":
      return 0.18;
    case "activity":
      return 0.16;
    case "event":
      return 0.14;
    case "memory":
      return 0.16;
    case "repetition":
      return 0.14;
    case "demography":
      return 0.12;
    case "seasonal_support":
      return 0.1;
  }
}

function strengthFromScore(score: number, noMaterial: boolean): MaterialAffordanceStrength {
  if (score >= 0.7 && !noMaterial) {
    return "strong";
  }
  if (score >= 0.44) {
    return "plausible";
  }
  if (score >= 0.16) {
    return "weak";
  }
  return "none";
}

function statusFromScore(
  score: number,
  evidenceCount: number,
  noMaterial: boolean,
  severeConstraint: boolean,
  inheritedOnly: boolean,
): MaterialAffordanceStatus {
  if (evidenceCount === 0) {
    return "unsupported_by_current_data";
  }
  if (score < 0.12) {
    return "absent";
  }
  if (inheritedOnly) {
    return "future_only";
  }
  if (severeConstraint && noMaterial) {
    return "blocked_constrained";
  }
  if (score >= 0.7 && !noMaterial) {
    return "strong";
  }
  if (score >= 0.44) {
    return "plausible";
  }
  return "weak";
}

function deriveLivedBasis(livedEvidenceCount: number, inheritedEvidenceCount: number): MaterialAffordanceLivedBasis {
  if (livedEvidenceCount > 0 && inheritedEvidenceCount > 0) {
    return "mixed";
  }
  if (inheritedEvidenceCount > 0) {
    return "inherited_not_lived";
  }
  if (livedEvidenceCount > 0) {
    return "lived";
  }
  return "unknown";
}

function hasResourceClass(context: MaterialAffordanceContext, classId: ResourceClassId): boolean {
  return context.resourceMemories.some((memory) => memory.resourceClassId === classId);
}

function hasAnyResourceClass(context: MaterialAffordanceContext, classIds: readonly ResourceClassId[]): boolean {
  return context.resourceMemories.some((memory) => classIds.includes(memory.resourceClassId));
}

function hasProcessingResource(context: MaterialAffordanceContext): boolean {
  return context.resourceMemories.some((memory) =>
    memory.resourceClassId === "generic_plant_food" ||
    memory.resourceClassId === "fallback_food" ||
    memory.resourceClassId === "medicinal_or_toxic" ||
    memory.plantObservation?.suspectedProcessingNeed === true ||
    memory.confidence.processingConfidence >= 0.16 ||
    memory.useHistory.lastYieldEstimate < 0.18);
}

function hasWoodBrushOrFiber(context: MaterialAffordanceContext): boolean {
  return context.knownTiles.some(isWoodOrBrushTile) || hasAnyResourceClass(context, ["fiber_material", "fuel_material"]);
}

function maxRepeatedReturn(context: MaterialAffordanceContext): number {
  return Math.max(0, ...context.places.map((place) => Math.max(place.repeatedReturnCount, place.visitCount)));
}

function dependencyLoad(band: Band): number {
  return clamp01((band.demography.dependents + band.demography.elders) / Math.max(1, band.demography.population));
}

function activityConfidence(trip: IntraSeasonTripRecord): NormalizedIntensity {
  switch (trip.activityResult) {
    case "successful_observation":
    case "target_found":
    case "returned_with_information":
      return 0.72;
    case "partial_success":
      return 0.58;
    case "target_not_found":
    case "failed_due_to_low_memory_confidence":
    case "failed_due_to_season_mismatch":
    case "no_effect_observed":
      return 0.42;
    case "failed_due_to_distance":
    case "failed_due_to_water_risk":
    case "delayed_return":
    case "abandoned_due_to_risk":
      return 0.38;
  }
}

function comparePlaceMemory(left: PlaceMemoryRecord, right: PlaceMemoryRecord): number {
  return (
    Math.max(right.repeatedReturnCount, right.visitCount) - Math.max(left.repeatedReturnCount, left.visitCount) ||
    right.confidence - left.confidence ||
    String(left.tileId).localeCompare(String(right.tileId))
  );
}

function compareRouteMemory(left: TravelCorridorMemory, right: TravelCorridorMemory): number {
  return (
    right.useCount - left.useCount ||
    right.confidence - left.confidence ||
    String(left.id).localeCompare(String(right.id))
  );
}

function compareCrossingMemory(left: KnownCrossingMemory, right: KnownCrossingMemory): number {
  return (
    right.useCount - left.useCount ||
    right.riskMemory - left.riskMemory ||
    String(left.crossingTileA).localeCompare(String(right.crossingTileA))
  );
}

function isWaterEdgeTile(tile: Tile): boolean {
  return tile.isRiverbank ||
    tile.isCoastal ||
    tile.isFloodplain ||
    tile.hasCreek === true ||
    tile.terrainKind === "wetlands" ||
    tile.terrainKind === "river_valley" ||
    tile.terrainKind === "lake" ||
    tile.terrainKind === "coast";
}

function isWoodOrBrushTile(tile: Tile): boolean {
  return tile.terrainKind === "forest" ||
    tile.terrainKind === "river_valley" ||
    tile.terrainKind === "wetlands" ||
    tile.biomeKind === "temperate_forest" ||
    tile.biomeKind === "boreal_forest" ||
    tile.biomeKind === "shrubland";
}

function isFuelTile(tile: Tile): boolean {
  return isWoodOrBrushTile(tile) ||
    tile.terrainKind === "plains" ||
    tile.biomeKind === "savanna" ||
    tile.biomeKind === "temperate_grassland";
}

function isStoneTile(tile: Tile): boolean {
  return tile.terrainKind === "hills" ||
    tile.terrainKind === "mountains" ||
    tile.isRiverbank ||
    tile.elevation > 0.62;
}

function isMineralHintTile(tile: Tile): boolean {
  return tile.terrainKind === "hills" ||
    tile.terrainKind === "mountains" ||
    tile.terrainKind === "desert" ||
    tile.elevation > 0.68;
}

function makeConstraint(
  label: string,
  severity: number,
  sourceSystem: MaterialAffordanceSourceSystem,
): MaterialAffordanceConstraint {
  return { label, severity: round2(clamp01(severity)), sourceSystem };
}

function buildOverviewTitle(items: readonly MaterialAffordanceItem[]): string {
  const strongOrPlausible = items.filter((item) => item.status === "strong" || item.status === "plausible");
  if (strongOrPlausible.length >= 3) {
    return "Several possible practice spaces are becoming visible.";
  }
  if (strongOrPlausible.length > 0) {
    return "A few practical possibilities are visible, but none are learned methods.";
  }
  return "Most material possibilities remain weak or constrained.";
}

function buildOverviewLines(items: readonly MaterialAffordanceItem[]): readonly string[] {
  const strongest = [...items]
    .filter((item) => item.status === "strong" || item.status === "plausible" || item.status === "weak")
    .sort((left, right) =>
      strengthRank(right.strength) - strengthRank(left.strength) ||
      right.confidence - left.confidence ||
      familyRank(left.family) - familyRank(right.family))
    .slice(0, 3);

  if (strongest.length === 0) {
    return ["Known materials, activity records, and pressures do not yet give much practical basis beyond ordinary survival competence."];
  }

  return strongest.map((item) => `${item.publicLabel}: ${item.meaning}`);
}

function countFamilies(items: readonly MaterialAffordanceItem[]): Readonly<Record<MaterialAffordanceFamily, number>> {
  const counts = { ...EMPTY_FAMILY_COUNTS };
  for (const item of items) {
    counts[item.family] += 1;
  }
  return counts;
}

function countStatuses(items: readonly MaterialAffordanceItem[]): Readonly<Record<MaterialAffordanceStatus, number>> {
  const counts = { ...EMPTY_STATUS_COUNTS };
  for (const item of items) {
    counts[item.status] += 1;
  }
  return counts;
}

function countStrengths(items: readonly MaterialAffordanceItem[]): Readonly<Record<MaterialAffordanceStrength, number>> {
  const counts = { ...EMPTY_STRENGTH_COUNTS };
  for (const item of items) {
    counts[item.strength] += 1;
  }
  return counts;
}

function countSourceSystems(evidence: readonly MaterialAffordanceEvidenceRef[]): Readonly<Record<MaterialAffordanceSourceSystem, number>> {
  const counts = { ...EMPTY_SOURCE_COUNTS };
  for (const entry of evidence) {
    counts[entry.sourceSystem] += 1;
  }
  return counts;
}

function countStrings(values: readonly string[]): Readonly<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const value of values) {
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

function capStrings<T extends string>(values: readonly T[], cap: number): readonly T[] {
  const seen = new Set<T>();
  const result: T[] = [];
  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }
    seen.add(value);
    result.push(value);
    if (result.length >= cap) {
      break;
    }
  }
  return result;
}

function familyRank(family: MaterialAffordanceFamily): number {
  return FAMILY_ORDER.indexOf(family);
}

function strengthRank(strength: MaterialAffordanceStrength): number {
  switch (strength) {
    case "strong":
      return 4;
    case "plausible":
      return 3;
    case "weak":
      return 2;
    case "none":
      return 1;
  }
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function round2(value: number): number {
  return Math.round(clamp01(value) * 100) / 100;
}

function byteLengthUtf8(value: string): number {
  return new TextEncoder().encode(value).length;
}

export function materialAffordanceFamilyLabel(family: MaterialAffordanceFamily): string {
  switch (family) {
    case "carrying_containers_cordage":
      return "Carrying / containers / cordage";
    case "shelter_camp_structure":
      return "Shelter / camp structure";
    case "fire_hearth_fuel":
      return "Fire / hearth / fuel";
    case "food_processing":
      return "Food processing";
    case "water_edge_trapping":
      return "Water-edge capture";
    case "route_crossing_engineering":
      return "Route / crossing";
    case "tool_cutting_scraping_digging":
      return "Tool / cutting / digging";
    case "visual_mineral_adhesive":
      return "Mineral / adhesive";
    case "camp_organization_care":
      return "Camp organization / care";
  }
}

export function materialAffordanceStatusLabel(status: MaterialAffordanceStatus): string {
  switch (status) {
    case "unsupported_by_current_data":
      return "unsupported";
    case "absent":
      return "not visible";
    case "weak":
      return "weak";
    case "plausible":
      return "plausible";
    case "strong":
      return "strong";
    case "blocked_constrained":
      return "constrained";
    case "future_only":
      return "future-only";
  }
}
