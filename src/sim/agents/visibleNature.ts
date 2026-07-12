import type { BandId, ReasonId, Season, TickNumber, TileId } from "../core/types";
import type { NormalizedIntensity } from "../rules/types";
import type { Tile, WorldState } from "../world/types";
import {
  deriveFaunaStockGeography,
  getFaunaStockDynamic,
  seasonalAvailabilityFactor,
  type FaunaClass,
  type FaunaHabitatType,
  type FaunaStockGeo,
  type FaunaStockKind,
} from "./faunaStock";
import {
  deriveForestPatchesForTile,
  getForestPatchState,
  type ForestGrowthTrend,
  type ForestPatch,
  type ForestSeasonalState,
  type TreeCoverType,
} from "./forestPatches";
import {
  derivePlantPatchesForTile,
  getPlantClassProfile,
  type PlantAbundanceTrend,
  type PlantClassId,
  type PlantFallbackRole,
  type PlantLifecycleState,
  type PlantPatch,
  type PlantPatchAvailability,
  type PlantSafetyRisk,
} from "./plantPatches";
import type { ResourceEcologyClassId, ResourceEcologyKnowledgeState } from "./resourceEcologyFoundation";
import type { Band, IntraSeasonTripRecord } from "./types";

export type VisibleFaunaArchetype =
  | "wolves"
  | "wild_horses"
  | "wild_cattle"
  | "deer_sheep_goat_like_herd"
  | "boar"
  | "hares_rabbits_small_game"
  | "fish_waterfowl_shellfish";

export type VisibleFaunaTag =
  | "herd_prey"
  | "solitary_prey"
  | "small_game"
  | "large_game"
  | "grazer"
  | "browser"
  | "omnivore"
  | "aquatic"
  | "dangerous_herbivore"
  | "pack_predator"
  | "lone_predator"
  | "scavenger"
  | "camp_follower_candidate"
  | "seasonal_mover"
  | "water_dependent"
  | "high_yield"
  | "high_risk"
  | "hard_to_hunt"
  | "fast_breeder"
  | "slow_breeder"
  | "future_domestication_candidate"
  | "future_mount_candidate"
  | "future_herd_management_candidate"
  | "trackable";

export type AnimalKnowledgeState =
  | "unknown"
  | "inferred_from_tracks"
  | "recent_tracks"
  | "direct_sighting"
  | "repeated_sighting"
  | "hunted_successfully"
  | "failed_to_find"
  | "reliable_route"
  | "dangerous"
  | "avoided"
  | "familiar"
  | "stale_route";

export type AnimalPerceptionKind =
  | "useful"
  | "feared"
  | "respected"
  | "avoided"
  | "watched"
  | "familiar"
  | "hunted_heavily"
  | "dangerous"
  | "reliable"
  | "unreliable"
  | "scarce"
  | "unpredictable"
  | "camp_following"
  | "camp_following_candidate"
  | "hard_to_catch"
  | "promising"
  | "dangerous_but_valuable"
  | "future_management_candidate"
  | "tolerated"
  | "promising_but_not_controlled";

export type DomesticationRelationshipStage =
  | "wild_no_relationship"
  | "repeatedly_seen"
  | "familiar_tracks_or_sightings"
  | "tolerated_proximity"
  | "camp_following_or_managed_contact"
  | "low_aggression_lineage"
  | "primitive_relationship"
  | "management_candidate"
  | "domestication_candidate";

export type VisiblePlantKnowledgeState =
  | "unknown"
  | "inferred"
  | "observed"
  | "tested"
  | "reliable"
  | "risky"
  | "avoided"
  | "stale";

export type ForestKnowledgeState = "unknown" | "inferred" | "observed" | "familiar" | "avoided" | "stale";

export type HumanForestPerception =
  | "useful"
  | "dense"
  | "risky"
  | "familiar"
  | "avoided"
  | "sheltering"
  | "good_for_animals"
  | "good_for_fruits_nuts"
  | "poor_visibility"
  | "overused"
  | "recovering"
  | "unknown";

export type AcuteEpisodeDurationClass = "hours" | "day" | "several_days" | "week" | "season_background";
export type AcuteEpisodeKind = "acute_dehydration" | "acute_exposure" | "acute_food_access_failure" | "acute_animal_encounter";
export type AcuteEpisodeOutcome =
  | "nonlethal_caution"
  | "route_rejected"
  | "movement_delayed"
  | "fatigue_shock"
  | "mortality_recorded_elsewhere";

export interface VisibleFaunaStockCard {
  readonly stockId: string;
  readonly derivedFromStockId?: string;
  readonly faunaClass: FaunaClass;
  readonly archetype: VisibleFaunaArchetype;
  readonly label: string;
  readonly sourceKind: FaunaStockKind | "predator_sign";
  readonly habitat: FaunaHabitatType;
  readonly anchorTileId: TileId;
  readonly seenTileIds: readonly TileId[];
  readonly tags: readonly VisibleFaunaTag[];
  readonly knowledgeState: AnimalKnowledgeState;
  readonly knownness: "unknown" | "tracks" | "recent_tracks" | "sighting" | "repeated_sighting" | "successful_hunt" | "failed_find" | "stale_route" | "danger_caution" | "reliable_route";
  readonly usefulness: "low" | "useful" | "promising" | "high_value" | "risky_value" | "unreliable" | "scarce";
  readonly confidence: NormalizedIntensity;
  readonly routeReliability: NormalizedIntensity;
  readonly perceivedAbundance: "scarce" | "low" | "steady" | "abundant";
  readonly seasonalAvailability: NormalizedIntensity;
  readonly huntingOrFishingPressure: NormalizedIntensity;
  readonly risk: NormalizedIntensity;
  readonly wariness: NormalizedIntensity;
  readonly humanTolerance: NormalizedIntensity;
  readonly habitatSuitability: NormalizedIntensity;
  readonly habitatReason: string;
  readonly recentEvidence: readonly string[];
  readonly perception: readonly AnimalPerceptionKind[];
  readonly topReasons: readonly string[];
  readonly rawSource: string;
  readonly noExactHiddenLocation: true;
}

export interface VisiblePlantPatchCard {
  readonly patchId: string;
  readonly tileId: TileId;
  readonly plantClassId: PlantClassId;
  readonly label: string;
  readonly linkedResourceClassId?: ResourceEcologyClassId;
  readonly knowledgeState: VisiblePlantKnowledgeState;
  readonly confidence: NormalizedIntensity;
  readonly seasonalAvailability: PlantPatchAvailability;
  readonly previousSeasonalAvailability: PlantPatchAvailability;
  readonly seasonalModifier: number;
  readonly seasonalPulseStrength: NormalizedIntensity;
  readonly abundanceTrend: PlantAbundanceTrend;
  readonly lifecycleState: PlantLifecycleState;
  readonly abundance: NormalizedIntensity;
  readonly pressure: NormalizedIntensity;
  readonly depletion: NormalizedIntensity;
  readonly recovery: NormalizedIntensity;
  readonly animalGrazingPressure: NormalizedIntensity;
  readonly reliability: NormalizedIntensity;
  readonly risk: PlantSafetyRisk;
  readonly laborCost: NormalizedIntensity;
  readonly fallbackRole: PlantFallbackRole;
  readonly fallbackRank: NormalizedIntensity;
  readonly plantPatchEffect: "seasonal_pulse" | "lean_scarcity" | "fallback_food" | "risky_or_avoided" | "overused" | "recovering" | "routine";
  readonly useStatus: "used" | "watched" | "suspected" | "avoided" | "overused" | "stale";
  readonly topReasons: readonly string[];
  readonly rawSource: string;
}

export interface VisibleAquaticResourceCard {
  readonly stockId: string;
  readonly label: string;
  readonly aquaticKind: FaunaStockKind;
  readonly waterContext: FaunaHabitatType;
  readonly anchorTileId: TileId;
  readonly seenTileIds: readonly TileId[];
  readonly resourceClassId: "aquatic_food" | "fish_or_shellfish";
  readonly knowledgeState: AnimalKnowledgeState;
  readonly confidence: NormalizedIntensity;
  readonly seasonalAvailability: NormalizedIntensity;
  readonly abundanceProductivity: "scarce" | "low" | "steady" | "abundant";
  readonly pressure: NormalizedIntensity;
  readonly recovery: NormalizedIntensity;
  readonly reliability: NormalizedIntensity;
  readonly riskDifficulty: NormalizedIntensity;
  readonly laborAccessCost: NormalizedIntensity;
  readonly protoCampLink: "current_place" | "known_place" | "none";
  readonly aquaticEffect: "fish_pulse" | "winter_buffer" | "wetland_buffer" | "overfished" | "recovery" | "poor_water_food" | "routine";
  readonly topReasons: readonly string[];
  readonly rawSource: string;
  readonly noExactHiddenLocation: true;
}

export interface VisibleForestPatchCard {
  readonly patchId: string;
  readonly tileId: TileId;
  readonly coverType: TreeCoverType;
  readonly label: string;
  readonly knowledgeState: ForestKnowledgeState;
  readonly confidence: NormalizedIntensity;
  readonly density: NormalizedIntensity;
  readonly maturity: NormalizedIntensity;
  readonly health: NormalizedIntensity;
  readonly seasonalState: ForestSeasonalState;
  readonly growthTrend: ForestGrowthTrend;
  readonly diebackTrend: NormalizedIntensity;
  readonly spreadChance: NormalizedIntensity;
  readonly fruitMastLink: ForestPatch["fruitMastLink"];
  readonly visibilityEffect: NormalizedIntensity;
  readonly movementAccessEffect: NormalizedIntensity;
  readonly animalHabitatValue: NormalizedIntensity;
  readonly woodFuelMaterialHook: NormalizedIntensity;
  readonly shadeRefugeValue: NormalizedIntensity;
  readonly pressure: NormalizedIntensity;
  readonly recovery: NormalizedIntensity;
  readonly perception: readonly HumanForestPerception[];
  readonly protoCampLink: "current_place" | "known_place" | "none";
  readonly linkedAnimalSigns: readonly string[];
  readonly linkedPlantPatches: readonly string[];
  readonly topReasons: readonly string[];
  readonly rawSource: string;
  readonly noExactHiddenLocation: true;
}

export interface AnimalKnowledgeMemory {
  readonly archetype: VisibleFaunaArchetype;
  readonly stockId: string;
  readonly state: AnimalKnowledgeState;
  readonly confidence: NormalizedIntensity;
  readonly source: "tracks" | "sighting" | "hunt" | "fishing" | "water_check" | "movement" | "predator_sign";
  readonly lastUpdatedYear: number;
  readonly lastUpdatedSeason: Season;
  readonly successCount: number;
  readonly failureCount: number;
  readonly riskOrAvoidanceNote?: string;
}

export interface AnimalPerceptionMemory {
  readonly archetype: VisibleFaunaArchetype;
  readonly perception: readonly AnimalPerceptionKind[];
  readonly reason: string;
  readonly confidence: NormalizedIntensity;
}

export interface DomesticationTrajectoryState {
  readonly archetype: VisibleFaunaArchetype;
  readonly stage: DomesticationRelationshipStage;
  readonly pathway: "commensal_proximity" | "prey_management" | "directed_locked" | "none";
  readonly candidate: boolean;
  readonly yearsOrSeasonsOfContact: number;
  readonly humanTolerance: NormalizedIntensity;
  readonly animalTolerance: NormalizedIntensity;
  readonly warinessFromHunting: NormalizedIntensity;
  readonly failurePressure: NormalizedIntensity;
  readonly failureReasons: readonly string[];
  readonly explicitLimits: readonly string[];
}

export interface AcuteRiskEpisode {
  readonly id: string;
  readonly kind: AcuteEpisodeKind;
  readonly trigger: string;
  readonly cause: string;
  readonly severity: NormalizedIntensity;
  readonly durationClass: AcuteEpisodeDurationClass;
  readonly exposedCohorts: readonly ("dependents" | "adults" | "elders")[];
  readonly mitigation: string;
  readonly outcome: AcuteEpisodeOutcome;
  readonly rawGrounding: string;
  readonly reasonIds: readonly ReasonId[];
}

export interface VisibleNatureState {
  readonly bandId: BandId;
  readonly lastUpdatedTick: TickNumber;
  readonly currentSeason: Season;
  readonly faunaCards: readonly VisibleFaunaStockCard[];
  readonly aquaticCards: readonly VisibleAquaticResourceCard[];
  readonly plantCards: readonly VisiblePlantPatchCard[];
  readonly forestCards: readonly VisibleForestPatchCard[];
  readonly animalKnowledge: readonly AnimalKnowledgeMemory[];
  readonly animalPerceptions: readonly AnimalPerceptionMemory[];
  readonly domesticationTrajectories: readonly DomesticationTrajectoryState[];
  readonly acuteEpisodes: readonly AcuteRiskEpisode[];
  readonly natureHeadline: string;
  readonly plantHeadline: string;
  readonly animalHeadline: string;
  readonly aquaticHeadline: string;
  readonly memoryCaps: {
    readonly candidateTileCap: number;
    readonly faunaCardCap: number;
    readonly aquaticCardCap: number;
    readonly plantCardCap: number;
    readonly forestCardCap: number;
    readonly animalKnowledgeCap: number;
    readonly acuteEpisodeCap: number;
  };
  readonly antiOmniscience: {
    readonly candidateTilesFromBandKnowledgeOnly: true;
    readonly exactHiddenStockLocationsRevealed: false;
    readonly everyResourceKnown: false;
  };
  readonly guards: {
    readonly noIndividualAnimalAgents: true;
    readonly noInstantDomestication: true;
    readonly noRidingOrMountBonus: true;
    readonly noAgriculture: true;
    readonly noCultureReligionTerritoryWar: true;
  };
  readonly reasonIds: readonly ReasonId[];
}

interface FaunaCandidate {
  readonly stock: FaunaStockGeo;
  readonly seenTileIds: readonly TileId[];
}

interface FaunaArchetypeProfile {
  readonly archetype: VisibleFaunaArchetype;
  readonly label: string;
  readonly tags: readonly VisibleFaunaTag[];
}

const CANDIDATE_TILE_CAP = 28;
const FAUNA_CARD_CAP = 10;
const AQUATIC_CARD_CAP = 8;
const PLANT_CARD_CAP = 10;
const FOREST_CARD_CAP = 8;
const ANIMAL_KNOWLEDGE_CAP = 10;
const ACUTE_EPISODE_CAP = 4;

export function applyVisibleNatureContext(world: WorldState): WorldState {
  const bands = Object.values(world.bands)
    .sort(compareBands)
    .reduce<Record<string, Band>>((records, band) => {
      records[String(band.id)] = {
        ...band,
        visibleNature: deriveVisibleNatureState(world, band),
      };
      return records;
    }, {});

  return { ...world, bands: bands as Readonly<Record<BandId, Band>> };
}

export function deriveVisibleNatureState(world: WorldState, band: Band): VisibleNatureState {
  const candidateTileIds = getVisibleNatureCandidateTiles(world, band);
  const faunaCards = deriveVisibleFaunaCards(world, band, candidateTileIds);
  const aquaticCards = deriveVisibleAquaticCards(band, faunaCards);
  const plantCards = deriveVisiblePlantCards(world, band, candidateTileIds, faunaCards);
  const forestCards = deriveVisibleForestCards(world, band, candidateTileIds, faunaCards, plantCards);
  const animalKnowledge = deriveAnimalKnowledge(world, band, faunaCards);
  const animalPerceptions = deriveAnimalPerceptions(faunaCards);
  const domesticationTrajectories = deriveDomesticationTrajectories(world, band, faunaCards);
  const acuteEpisodes = deriveAcuteEpisodes(world, band, faunaCards);

  return {
    bandId: band.id,
    lastUpdatedTick: world.time.tick,
    currentSeason: world.time.season,
    faunaCards,
    aquaticCards,
    plantCards,
    forestCards,
    animalKnowledge,
    animalPerceptions,
    domesticationTrajectories,
    acuteEpisodes,
    natureHeadline: describeNatureHeadline(faunaCards, aquaticCards, plantCards, forestCards, acuteEpisodes),
    plantHeadline: describePlantHeadline(plantCards),
    animalHeadline: describeAnimalHeadline(faunaCards),
    aquaticHeadline: describeAquaticHeadline(aquaticCards),
    memoryCaps: {
      candidateTileCap: CANDIDATE_TILE_CAP,
      faunaCardCap: FAUNA_CARD_CAP,
      aquaticCardCap: AQUATIC_CARD_CAP,
      plantCardCap: PLANT_CARD_CAP,
      forestCardCap: FOREST_CARD_CAP,
      animalKnowledgeCap: ANIMAL_KNOWLEDGE_CAP,
      acuteEpisodeCap: ACUTE_EPISODE_CAP,
    },
    antiOmniscience: {
      candidateTilesFromBandKnowledgeOnly: true,
      exactHiddenStockLocationsRevealed: false,
      everyResourceKnown: false,
    },
    guards: {
      noIndividualAnimalAgents: true,
      noInstantDomestication: true,
      noRidingOrMountBonus: true,
      noAgriculture: true,
      noCultureReligionTerritoryWar: true,
    },
    reasonIds: collectNatureReasonIds(world, band, faunaCards, aquaticCards, plantCards, forestCards, acuteEpisodes),
  };
}

function getVisibleNatureCandidateTiles(world: WorldState, band: Band): readonly TileId[] {
  const currentTile = world.tiles[band.position];
  const values: TileId[] = [
    band.position,
    ...Object.keys(band.knowledge.observedTiles).map((tileId) => tileId as TileId),
    ...Object.keys(band.placeMemory).map((tileId) => tileId as TileId),
    ...(band.recentIntraSeasonTrips ?? []).map((trip) => trip.targetTileId),
    ...(band.recentIntraSeasonTrips ?? []).flatMap((trip) => trip.pathTiles),
    ...(band.protoCampMemory?.topPlaces ?? []).map((place) => place.tileId),
    ...(band.protoCampMemory?.currentPlace === undefined ? [] : [band.protoCampMemory.currentPlace.tileId]),
  ];
  const seen = new Set<string>();

  return values
    .filter((tileId) => {
      if (world.tiles[tileId] === undefined) {
        return false;
      }
      const key = String(tileId);
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .sort((left, right) => {
      const leftTile = world.tiles[left];
      const rightTile = world.tiles[right];
      const distanceDelta =
        getGridDistance(currentTile, leftTile) - getGridDistance(currentTile, rightTile);
      return distanceDelta === 0 ? String(left).localeCompare(String(right)) : distanceDelta;
    })
    .slice(0, CANDIDATE_TILE_CAP);
}

function deriveVisibleFaunaCards(
  world: WorldState,
  band: Band,
  candidateTileIds: readonly TileId[],
): readonly VisibleFaunaStockCard[] {
  const geography = deriveFaunaStockGeography(world);
  const byStock = new Map<string, FaunaCandidate>();

  for (const tileId of candidateTileIds) {
    for (const stock of geography.byTile.get(tileId) ?? []) {
      const persisted = band.animalPatternKnowledge?.records.some((record) => record.stockId === String(stock.id)) === true;
      const directlyTraced = (band.recentIntraSeasonTrips ?? []).some((trip) => trip.animalActivityTrace?.stockId === String(stock.id));
      if (!persisted && !directlyTraced) {
        continue; // known terrain is not an automatic animal sighting
      }
      const existing = byStock.get(stock.id);
      byStock.set(stock.id, {
        stock,
        seenTileIds: uniqueTileIds([...(existing?.seenTileIds ?? []), tileId]).slice(0, 5),
      });
    }
  }

  const cards = [...byStock.values()]
    .map((candidate) => faunaCandidateToCard(world, band, candidate))
    .sort(compareFaunaCards);
  const predatorCards = derivePredatorSignCards(world, band, cards);

  return [...cards, ...predatorCards]
    .sort(compareFaunaCards)
    .slice(0, FAUNA_CARD_CAP);
}

function faunaCandidateToCard(world: WorldState, band: Band, candidate: FaunaCandidate): VisibleFaunaStockCard {
  const { stock } = candidate;
  const profile = classifyFaunaArchetype(world, stock);
  const relevantTrips = getRelevantAnimalTrips(band, stock.faunaClass, stock.influenceTileIds);
  const successfulTrips = relevantTrips.filter(isSuccessfulTrip).length;
  const failedTrips = relevantTrips.filter(isFailedTrip).length;
  const animalTrace = relevantTrips.find((trip) => trip.animalActivityTrace?.stockId === String(stock.id))?.animalActivityTrace;
  const persisted = band.animalPatternKnowledge?.records.find((record) => record.stockId === String(stock.id));
  const observedAbundance = animalTrace?.currentAbundance ?? 0.5;
  const observedDisturbance = animalTrace?.disturbance ?? 0.25;
  const seasonalAvailability = round2(animalTrace?.seasonalAvailability ?? 0.5);
  const routeReliability = round2(clamp01((persisted?.confidence ?? animalTrace?.confidence ?? 0.2) * 0.7 + Math.min(0.24, (persisted?.observationCount ?? 1) * 0.06)));
  const knowledgeState: AnimalKnowledgeState = persisted?.state === "stale" || persisted?.state === "dormant" ? "stale_route" :
    persisted?.state === "contradicted" ? "failed_to_find" :
    (persisted?.directObservationCount ?? 0) >= 3 ? "repeated_sighting" : "direct_sighting";
  const knownness = classifyKnownness(knowledgeState);
  const confidence = round2(clamp01(
    (persisted?.confidence ?? animalTrace?.confidence ?? 0.18) * 0.62 +
      seasonalAvailability * 0.12 +
      routeReliability * 0.14 +
      Math.min(0.18, relevantTrips.length * 0.05),
  ));
  const wariness = round2(clamp01(observedDisturbance * 0.46 + successfulTrips * 0.12 + (animalTrace?.warinessChange ?? 0)));
  const humanTolerance = round2(clamp01(0.42 - wariness * 0.35 - (animalTrace?.dangerRisk ?? 0.2) * 0.18 + proximityCampSignal(band, stock.anchorTileId) * 0.12));
  const risk = round2(clamp01((animalTrace?.dangerRisk ?? 0.2) + failedTrips * 0.08));
  const usefulness = classifyAnimalUsefulness(profile, observedAbundance, seasonalAvailability, risk, routeReliability, successfulTrips, failedTrips);
  const pressure = round2(clamp01(successfulTrips * 0.1 + failedTrips * 0.06 + (animalTrace?.pressureApplied ?? 0) * 0.24));
  const recentEvidence = deriveRecentAnimalEvidence(stock, profile, candidate.seenTileIds, relevantTrips, animalTrace, band);

  return {
    stockId: String(stock.id),
    faunaClass: stock.faunaClass,
    archetype: profile.archetype,
    label: profile.label,
    sourceKind: stock.kind,
    habitat: stock.habitat,
    anchorTileId: stock.anchorTileId,
    seenTileIds: candidate.seenTileIds,
    tags: profile.tags,
    knowledgeState,
    knownness,
    usefulness,
    confidence,
    routeReliability,
    perceivedAbundance: abundanceBand(observedAbundance),
    seasonalAvailability,
    huntingOrFishingPressure: pressure,
    risk,
    wariness,
    humanTolerance,
    habitatSuitability: stock.habitatSuitability,
    habitatReason: stock.habitatBasis.join("; "),
    recentEvidence,
    perception: derivePerceptionKinds(profile, risk, observedAbundance, wariness, successfulTrips, failedTrips, routeReliability, usefulness),
    topReasons: topFaunaReasons(stock, profile, seasonalAvailability, observedAbundance, relevantTrips.length, routeReliability),
    rawSource: "persisted AnimalPatternKnowledge + recent observed AnimalActivityTrace (no current hidden stock read)",
    noExactHiddenLocation: true,
  };
}

function deriveVisibleAquaticCards(
  band: Band,
  faunaCards: readonly VisibleFaunaStockCard[],
): readonly VisibleAquaticResourceCard[] {
  return faunaCards
    .filter(isFiniteAquaticCard)
    .map((card) => faunaCardToAquaticCard(band, card))
    .sort((left, right) =>
      right.confidence - left.confidence ||
      right.pressure - left.pressure ||
      left.label.localeCompare(right.label) ||
      left.stockId.localeCompare(right.stockId),
    )
    .slice(0, AQUATIC_CARD_CAP);
}

function isFiniteAquaticCard(
  card: VisibleFaunaStockCard,
): card is VisibleFaunaStockCard & { readonly sourceKind: FaunaStockKind } {
  return card.faunaClass === "aquatic_food" && card.sourceKind !== "predator_sign";
}

function faunaCardToAquaticCard(
  band: Band,
  card: VisibleFaunaStockCard & { readonly sourceKind: FaunaStockKind },
): VisibleAquaticResourceCard {
  const protoCampLink = getAquaticProtoCampLink(band, card);
  const pressure = card.huntingOrFishingPressure;
  const recovery = round2(clamp01(
    0.18 +
      (pressure < 0.16 ? 0.34 : 0) +
      card.seasonalAvailability * 0.18 +
      perceivedAbundanceValue(card.perceivedAbundance) * 0.2 -
      card.wariness * 0.12,
  ));
  const riskDifficulty = round2(clamp01(card.risk + (card.sourceKind === "shellfish_reedbed" ? 0.08 : 0)));
  const reliability = round2(clamp01(
    card.confidence * 0.34 +
      card.seasonalAvailability * 0.28 +
      perceivedAbundanceValue(card.perceivedAbundance) * 0.24 +
      recovery * 0.14 -
      pressure * 0.18,
  ));
  const aquaticEffect = classifyAquaticEffect(card, pressure, recovery);

  return {
    stockId: card.stockId,
    label: labelAquaticResource(card),
    aquaticKind: card.sourceKind,
    waterContext: card.habitat,
    anchorTileId: card.anchorTileId,
    seenTileIds: card.seenTileIds,
    resourceClassId: card.sourceKind === "shellfish_reedbed" ? "fish_or_shellfish" : "aquatic_food",
    knowledgeState: card.knowledgeState,
    confidence: card.confidence,
    seasonalAvailability: card.seasonalAvailability,
    abundanceProductivity: card.perceivedAbundance,
    pressure,
    recovery,
    reliability,
    riskDifficulty,
    laborAccessCost: round2(clamp01(0.18 + riskDifficulty * 0.28 + (card.habitat === "river_reach" ? 0.1 : 0))),
    protoCampLink,
    aquaticEffect,
    topReasons: topAquaticReasons(card, aquaticEffect, protoCampLink),
    rawSource: `${card.rawSource}; aquatic card projected from visible finite stock card`,
    noExactHiddenLocation: true,
  };
}

function derivePredatorSignCards(
  world: WorldState,
  band: Band,
  preyCards: readonly VisibleFaunaStockCard[],
): readonly VisibleFaunaStockCard[] {
  const prey = preyCards.find((card) =>
    (card.tags.includes("herd_prey") || card.tags.includes("large_game")) &&
    card.confidence >= 0.24 &&
    !card.tags.includes("aquatic"),
  );

  if (prey === undefined) {
    return [];
  }

  const hash = hashUnit(String(world.seed), [String(band.id), prey.stockId, "predator_sign"]);
  if (hash < 0.28 && prey.risk < 0.34) {
    return [];
  }

  const risk = round2(clamp01(0.32 + prey.confidence * 0.24 + prey.risk * 0.2));
  return [{
    stockId: `predator-sign:${prey.stockId}`,
    derivedFromStockId: prey.stockId,
    faunaClass: "animal_food",
    archetype: "wolves",
    label: "wolf-like predator signs",
    sourceKind: "predator_sign",
    habitat: prey.habitat,
    anchorTileId: prey.anchorTileId,
    seenTileIds: prey.seenTileIds.slice(0, 3),
    tags: ["pack_predator", "scavenger", "camp_follower_candidate", "seasonal_mover", "high_risk", "trackable"],
    knowledgeState: risk >= 0.48 ? "dangerous" : "inferred_from_tracks",
    knownness: risk >= 0.48 ? "danger_caution" : "tracks",
    usefulness: "low",
    confidence: round2(clamp01(0.24 + prey.confidence * 0.48)),
    routeReliability: round2(clamp01(prey.routeReliability * 0.4 + prey.confidence * 0.18)),
    perceivedAbundance: "low",
    seasonalAvailability: prey.seasonalAvailability,
    huntingOrFishingPressure: 0,
    risk,
    wariness: 0.36,
    humanTolerance: 0.18,
    habitatSuitability: prey.habitatSuitability,
    habitatReason: `predator signs inferred from prey route; ${prey.habitatReason}`,
    recentEvidence: ["predator signs near visible prey route"],
    perception: risk >= 0.48 ? ["feared", "dangerous", "watched"] : ["watched", "unpredictable"],
    topReasons: ["predator signs derived from visible prey route", "risk only: no predator agents or attack story"],
    rawSource: "VisibleNatureState fauna prey card + deterministic predator-sign gate",
    noExactHiddenLocation: true,
  }];
}

function deriveVisiblePlantCards(
  world: WorldState,
  band: Band,
  candidateTileIds: readonly TileId[],
  faunaCards: readonly VisibleFaunaStockCard[],
): readonly VisiblePlantPatchCard[] {
  const cards: VisiblePlantPatchCard[] = [];

  for (const tileId of candidateTileIds.slice(0, CANDIDATE_TILE_CAP)) {
    const tile = world.tiles[tileId];
    if (tile === undefined) {
      continue;
    }
    for (const patch of derivePlantPatchesForTile(tile, world.time, 3)) {
      cards.push(plantPatchToCard(world, band, patch, tileId, grazingPressureForTile(faunaCards, tileId)));
    }
  }

  return cards
    .sort((left, right) =>
      right.animalGrazingPressure - left.animalGrazingPressure ||
      right.confidence - left.confidence ||
      right.abundance - left.abundance ||
      left.label.localeCompare(right.label),
    )
    .slice(0, PLANT_CARD_CAP);
}

function deriveVisibleForestCards(
  world: WorldState,
  band: Band,
  candidateTileIds: readonly TileId[],
  faunaCards: readonly VisibleFaunaStockCard[],
  plantCards: readonly VisiblePlantPatchCard[],
): readonly VisibleForestPatchCard[] {
  const cards: VisibleForestPatchCard[] = [];
  const forestCandidateTileIds = getVisibleForestCandidateTiles(world, band, candidateTileIds);

  for (const tileId of forestCandidateTileIds) {
    const tile = world.tiles[tileId];

    if (tile === undefined) {
      continue;
    }

    for (const patch of deriveForestPatchesForTile(tile, world.time, getForestPatchState(world, tile))) {
      cards.push(forestPatchToCard(world, band, patch, faunaCards, plantCards));
    }
  }

  return cards
    .sort((left, right) =>
      right.confidence - left.confidence ||
      right.animalHabitatValue - left.animalHabitatValue ||
      right.visibilityEffect - left.visibilityEffect ||
      left.label.localeCompare(right.label) ||
      left.patchId.localeCompare(right.patchId),
    )
    .slice(0, FOREST_CARD_CAP);
}

function forestPatchToCard(
  world: WorldState,
  band: Band,
  patch: ForestPatch,
  faunaCards: readonly VisibleFaunaStockCard[],
  plantCards: readonly VisiblePlantPatchCard[],
): VisibleForestPatchCard {
  const currentTile = patch.tileId === band.position;
  const nearbyVisibleTile = !currentTile && isCurrentNeighborTile(world, band, patch.tileId);
  const placeMemory = band.placeMemory[patch.tileId];
  const linkedAnimalSigns = faunaCards
    .filter((card) => card.seenTileIds.includes(patch.tileId))
    .map((card) => card.label)
    .slice(0, 3);
  const linkedPlantPatches = plantCards
    .filter((card) =>
      card.tileId === patch.tileId ||
      (patch.fruitMastLink === "fruit_berry" && card.plantClassId === "fruit_berry") ||
      ((patch.fruitMastLink === "nuts_mast" || patch.fruitMastLink === "mixed_mast") && card.plantClassId === "nuts_mast"),
    )
    .map((card) => card.label)
    .slice(0, 3);
  const knowledgeState = getForestKnowledgeState(currentTile, nearbyVisibleTile, placeMemory !== undefined, patch);
  const confidence = round2(clamp01(
    (currentTile ? 0.28 : 0.08) +
      (nearbyVisibleTile ? 0.12 : 0) +
      (placeMemory === undefined ? 0 : placeMemory.attachment * 0.18 + Math.min(0.16, placeMemory.visitCount * 0.02)) +
      patch.density * 0.18 +
      patch.visibilityEffect * 0.12 +
      linkedAnimalSigns.length * 0.04 +
      linkedPlantPatches.length * 0.04,
  ));
  const protoCampLink = getForestProtoCampLink(band, patch.tileId);
  const perception = deriveForestPerception(patch, linkedAnimalSigns, linkedPlantPatches, placeMemory?.valences ?? []);

  return {
    patchId: patch.id,
    tileId: patch.tileId,
    coverType: patch.coverType,
    label: labelForestPatch(patch.coverType),
    knowledgeState,
    confidence,
    density: patch.density,
    maturity: patch.maturity,
    health: patch.health,
    seasonalState: patch.seasonalState,
    growthTrend: patch.growthTrend,
    diebackTrend: patch.diebackTrend,
    spreadChance: patch.spreadChance,
    fruitMastLink: patch.fruitMastLink,
    visibilityEffect: patch.visibilityEffect,
    movementAccessEffect: patch.travelAccessEffect,
    animalHabitatValue: patch.animalHabitatValue,
    woodFuelMaterialHook: patch.woodFuelMaterialValue,
    shadeRefugeValue: patch.shadeRefugeValue,
    pressure: patch.pressure,
    recovery: patch.recovery,
    perception,
    protoCampLink,
    linkedAnimalSigns,
    linkedPlantPatches,
    topReasons: topForestReasons(patch, nearbyVisibleTile, linkedAnimalSigns, linkedPlantPatches, protoCampLink),
    rawSource: `${patch.rawSource}; visible forest card projected from band-known/current candidate tiles plus immediate nearby tree-cover cues in ${world.time.season}`,
    noExactHiddenLocation: true,
  };
}

function getVisibleForestCandidateTiles(
  world: WorldState,
  band: Band,
  candidateTileIds: readonly TileId[],
): readonly TileId[] {
  const currentTile = world.tiles[band.position];
  const values = [
    ...candidateTileIds,
    ...(currentTile?.neighbors ?? []),
  ];
  const seen = new Set<string>();
  const out: TileId[] = [];

  for (const tileId of values) {
    if (world.tiles[tileId] === undefined) {
      continue;
    }
    const key = String(tileId);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(tileId);
    if (out.length >= CANDIDATE_TILE_CAP) {
      break;
    }
  }

  return out;
}

function isCurrentNeighborTile(world: WorldState, band: Band, tileId: TileId): boolean {
  return world.tiles[band.position]?.neighbors.includes(tileId) === true;
}

function plantPatchToCard(
  world: WorldState,
  band: Band,
  patch: PlantPatch,
  tileId: TileId,
  animalGrazingPressure: number,
): VisiblePlantPatchCard {
  const profile = getPlantClassProfile(patch.plantClassId);
  const linkedResourceClassId = mapPlantToResourceEcologyClass(patch.plantClassId);
  const matchingMemory = linkedResourceClassId === undefined
    ? undefined
    : band.resourceEcology?.knowledge.topMemories.find((memory) =>
      memory.placeTileId === tileId && memory.resourceClassId === linkedResourceClassId,
    );
  const state = world.plantPatchState?.[String(patch.patchId)];
  const humanPressure = state?.depletion ?? patch.depletion;
  const pressure = round2(clamp01(humanPressure + animalGrazingPressure * 0.18));
  const abundance = round2(clamp01(patch.currentAbundance * (1 - pressure)));
  const knowledgeState = translatePlantKnowledgeState(matchingMemory?.knowledgeState, tileId === band.position, pressure, patch);
  const confidence = round2(clamp01(
    (matchingMemory?.confidence ?? 0) * 0.56 +
      patch.visibility * 0.22 +
      patch.reliability * 0.14 +
      (tileId === band.position ? 0.18 : 0.04),
  ));

  return {
    patchId: String(patch.patchId),
    tileId,
    plantClassId: patch.plantClassId,
    label: profile.debugLabel,
    ...(linkedResourceClassId === undefined ? {} : { linkedResourceClassId }),
    knowledgeState,
    confidence,
    seasonalAvailability: patch.currentSeasonalAvailability,
    previousSeasonalAvailability: patch.previousAvailability,
    seasonalModifier: round2(patch.seasonalModifier),
    seasonalPulseStrength: round2(clamp01(patch.seasonalPulseStrength)),
    abundanceTrend: patch.abundanceTrend,
    lifecycleState: patch.lifecycleState,
    abundance,
    pressure,
    depletion: round2(clamp01(humanPressure)),
    recovery: round2(clamp01(patch.naturalRecoveryProgress + patch.naturalRegrowthModifier * 0.4)),
    animalGrazingPressure: round2(animalGrazingPressure),
    reliability: round2(patch.reliabilityThisSeason),
    risk: patch.safetyRisk,
    laborCost: round2(clamp01(patch.laborCost)),
    fallbackRole: patch.fallbackRole,
    fallbackRank: round2(clamp01(patch.fallbackRank)),
    plantPatchEffect: classifyPlantPatchEffect(patch, pressure, knowledgeState),
    useStatus: getPlantUseStatus(knowledgeState, pressure, patch),
    topReasons: topPlantReasons(patch, pressure, animalGrazingPressure, matchingMemory?.rawSource),
    rawSource: "derivePlantPatchesForTile on band-known/current candidate tiles + ResourceEcology knowledge memory",
  };
}

function deriveAnimalKnowledge(
  world: WorldState,
  band: Band,
  faunaCards: readonly VisibleFaunaStockCard[],
): readonly AnimalKnowledgeMemory[] {
  // ROUTINES-2: this is now a projection of persisted observations, never a
  // fresh hidden-stock read. faunaCards supply an archetype label only when a
  // matching observed record already exists.
  return (band.animalPatternKnowledge?.records ?? [])
    .map((record) => {
      const card = faunaCards.find((entry) => entry.stockId === record.stockId);
      const state: AnimalKnowledgeState = record.state === "stale" || record.state === "dormant"
        ? "stale_route"
        : record.state === "contradicted"
          ? "failed_to_find"
          : record.directObservationCount >= 3
            ? "repeated_sighting"
            : record.directObservationCount > 0
              ? "direct_sighting"
              : "inferred_from_tracks";
      const lastSeason = record.seasonsObserved[record.seasonsObserved.length - 1] ?? world.time.season;
      return {
        archetype: card?.archetype ?? archetypeForPersistedFaunaKind(record.faunaKind),
        stockId: record.stockId,
        state,
        confidence: record.confidence,
        source: record.directObservationCount > 0 ? "sighting" as const : "tracks" as const,
        lastUpdatedYear: Math.floor(Number(record.lastObservedTick) / 4),
        lastUpdatedSeason: lastSeason,
        successCount: Math.max(0, record.observationCount - record.contradictionCount),
        failureCount: record.contradictionCount,
        ...(record.contradictionCount > 0 ? { riskOrAvoidanceNote: "later observation contradicted part of the remembered pattern" } : {}),
      };
    })
    .sort((left, right) => right.confidence - left.confidence || left.stockId.localeCompare(right.stockId))
    .slice(0, ANIMAL_KNOWLEDGE_CAP);
}

function archetypeForPersistedFaunaKind(kind: string): VisibleFaunaArchetype {
  if (kind.includes("fish") || kind === "waterfowl" || kind === "shellfish_reedbed") return "fish_waterfowl_shellfish";
  if (kind === "large_game") return "wild_cattle";
  if (kind === "small_game") return "hares_rabbits_small_game";
  if (kind === "forest_edge_game") return "boar";
  return "deer_sheep_goat_like_herd";
}

function deriveAnimalPerceptions(faunaCards: readonly VisibleFaunaStockCard[]): readonly AnimalPerceptionMemory[] {
  return faunaCards
    .filter((card) => card.perception.length > 0)
    .map((card) => ({
      archetype: card.archetype,
      perception: card.perception,
      reason: card.topReasons.join("; "),
      confidence: card.confidence,
    }))
    .slice(0, ANIMAL_KNOWLEDGE_CAP);
}

function deriveDomesticationTrajectories(
  world: WorldState,
  band: Band,
  faunaCards: readonly VisibleFaunaStockCard[],
): readonly DomesticationTrajectoryState[] {
  return (band.animalManagement?.records ?? [])
    .map((record) => {
      const archetype = faunaCards.find((card) => card.stockId === record.stockId)?.archetype ?? archetypeForPersistedFaunaKind(record.faunaKind);
      const failurePressure = round2(clamp01(record.failures * 0.22 + record.stressObserved * 0.5));
      const stage: DomesticationRelationshipStage = record.status === "holding" && record.outcome === "holding_succeeded"
        ? "camp_following_or_managed_contact"
        : record.status === "feeding" && record.successes > 0
          ? "tolerated_proximity"
          : record.status === "abandoned"
            ? "wild_no_relationship"
            : "repeatedly_seen";
      return {
        archetype,
        stage,
        pathway: "prey_management" as const,
        candidate: record.status === "feeding" || record.status === "holding",
        yearsOrSeasonsOfContact: record.contactSeasons,
        humanTolerance: record.willingness,
        animalTolerance: record.animalToleranceObserved,
        warinessFromHunting: record.stressObserved,
        failurePressure,
        failureReasons: record.failures === 0 ? [] : [record.outcome, record.reason],
        explicitLimits: ["temporary contact only", "no ownership or breeding program", "feeding/holding can fail or go dormant"],
      };
    })
    .sort((left, right) =>
      stageRank(right.stage) - stageRank(left.stage) ||
      right.failurePressure - left.failurePressure ||
      left.archetype.localeCompare(right.archetype),
    )
    .slice(0, 6);
}

function deriveAcuteEpisodes(
  world: WorldState,
  band: Band,
  faunaCards: readonly VisibleFaunaStockCard[],
): readonly AcuteRiskEpisode[] {
  const support = band.seasonalSupport?.currentSeasonSupport;
  const latestMove = band.recentResidentialMoveEvents?.[0];
  const latestTrip = band.recentIntraSeasonTrips?.[0];
  const episodes: AcuteRiskEpisode[] = [];

  if ((support?.waterStress ?? 0) >= 0.52 || latestMove?.hardshipOutcome === "rejected") {
    episodes.push({
      id: `acute:${band.id}:${world.time.tick}:dehydration`,
      kind: "acute_dehydration",
      trigger: latestMove?.hardshipOutcome === "rejected" ? "rejected hard route" : "high seasonal water stress",
      cause: latestMove?.hardshipReason ?? "water stress and known-route uncertainty",
      severity: round2(Math.max(support?.waterStress ?? 0, latestMove?.hardshipRisk ?? 0)),
      durationClass: "day",
      exposedCohorts: ["dependents", "elders", "adults"],
      mitigation: latestMove?.hardshipOutcome === "rejected" ? "route rejected before unexplained deaths" : "staying near known water reduced the episode to caution",
      outcome: (band.demography.demographicChurn?.waterStressDeathsThisYear ?? 0) > 0 ? "mortality_recorded_elsewhere" : "route_rejected",
      rawGrounding: "Band.seasonalSupport.currentSeasonSupport.waterStress + recentResidentialMoveEvents.hardshipOutcome",
      reasonIds: [
        `reason:acute:${band.id}:${world.time.tick}:dehydration:${band.position}` as ReasonId,
        ...(band.seasonalSupport?.reasonIds ?? []).slice(-3),
      ],
    });
  }

  if (world.time.season === "winter" && ((support?.foodStress ?? 0) >= 0.34 || isOpenExposureTile(world.tiles[band.position]))) {
    episodes.push({
      id: `acute:${band.id}:${world.time.tick}:exposure`,
      kind: "acute_exposure",
      trigger: "winter lean-season travel/exposure constraint",
      cause: isOpenExposureTile(world.tiles[band.position]) ? "open country offers less shelter during lean season" : "food stress makes winter exposure harder to absorb",
      severity: round2(clamp01(0.28 + (support?.foodStress ?? 0) * 0.48 + (isOpenExposureTile(world.tiles[band.position]) ? 0.16 : 0))),
      durationClass: "several_days",
      exposedCohorts: ["dependents", "elders"],
      mitigation: band.protoCampMemory?.currentPlace?.campLikeState === "refuge_anchor"
        ? "familiar refuge buffered the exposure risk"
        : "caution and reduced travel kept this nonlethal",
      outcome: "nonlethal_caution",
      rawGrounding: "WorldTime.season + SeasonalSupport.foodStress + current tile terrain",
      reasonIds: [`reason:acute:${band.id}:${world.time.tick}:winter_exposure:${band.position}` as ReasonId],
    });
  }

  if ((support?.foodStress ?? 0) >= 0.5 && latestTrip !== undefined && isFailedTrip(latestTrip)) {
    episodes.push({
      id: `acute:${band.id}:${world.time.tick}:food_failure`,
      kind: "acute_food_access_failure",
      trigger: "failed food activity during existing stress",
      cause: latestTrip.activityOutcomeSummary,
      severity: round2(clamp01((support?.foodStress ?? 0) * 0.7 + 0.18)),
      durationClass: "week",
      exposedCohorts: ["dependents", "adults"],
      mitigation: band.resourceEcology?.support.fallbackContribution !== undefined && band.resourceEcology.support.fallbackContribution > 0.1
        ? "fallback foods limited the failure to a short-run stress episode"
        : "no extra mitigation beyond existing seasonal support",
      outcome: (band.demography.demographicChurn?.starvationDeathsThisYear ?? 0) > 0 ? "mortality_recorded_elsewhere" : "fatigue_shock",
      rawGrounding: "SeasonalSupport.foodStress + failed IntraSeasonTripRecord",
      reasonIds: [
        `reason:acute:${band.id}:${world.time.tick}:food_failure:${latestTrip.targetTileId}` as ReasonId,
        ...latestTrip.activityOutcomeReasonIds.slice(-3),
      ],
    });
  }

  const dangerous = faunaCards.find((card) => card.risk >= 0.55 || card.tags.includes("dangerous_herbivore") || card.tags.includes("pack_predator"));
  if (dangerous !== undefined && latestTrip !== undefined && (latestTrip.taskGroupType === "hunting_group" || latestTrip.taskGroupType === "local_foraging_group")) {
    episodes.push({
      id: `acute:${band.id}:${world.time.tick}:animal_encounter`,
      kind: "acute_animal_encounter",
      trigger: "dangerous animal signs near recent work",
      cause: dangerous.topReasons.join("; "),
      severity: round2(clamp01(dangerous.risk * 0.72 + (isFailedTrip(latestTrip) ? 0.18 : 0.04))),
      durationClass: "hours",
      exposedCohorts: ["adults"],
      mitigation: isFailedTrip(latestTrip) ? "activity was abandoned or returned cautious" : "signs remained a risk cue, not an injury story",
      outcome: "nonlethal_caution",
      rawGrounding: "VisibleNatureState.faunaCards risk + recent IntraSeasonTripRecord",
      reasonIds: [`reason:acute:${band.id}:${world.time.tick}:animal_encounter:${dangerous.anchorTileId}` as ReasonId],
    });
  }

  return episodes
    .sort((left, right) =>
      right.severity - left.severity ||
      left.kind.localeCompare(right.kind),
    )
    .slice(0, ACUTE_EPISODE_CAP);
}

function classifyFaunaArchetype(world: WorldState, stock: FaunaStockGeo): FaunaArchetypeProfile {
  if (stock.faunaClass === "aquatic_food") {
    return {
      archetype: "fish_waterfowl_shellfish",
      label: stock.kind === "waterfowl" ? "waterfowl / aquatic birds" : "fish / shellfish-like aquatic stock",
      tags: ["aquatic", "seasonal_mover", "water_dependent", "trackable"],
    };
  }

  if (stock.kind === "waterfowl") {
    return {
      archetype: "fish_waterfowl_shellfish",
      label: "waterfowl / wetland bird stock",
      tags: ["small_game", "seasonal_mover", "water_dependent", "trackable"],
    };
  }

  if (stock.kind === "small_game") {
    return {
      archetype: "hares_rabbits_small_game",
      label: "hares / rabbits / small game",
      tags: ["small_game", "fast_breeder", "trackable"],
    };
  }

  if (stock.kind === "medium_game" && (stock.habitat === "open_valley" || stock.habitat === "open_plain" || stock.habitat === "river_meadow")) {
    return {
      archetype: "wild_horses",
      label: "wild horse-like herd",
      tags: ["herd_prey", "large_game", "grazer", "seasonal_mover", "water_dependent", "hard_to_hunt", "future_domestication_candidate", "future_mount_candidate", "trackable"],
    };
  }

  if (stock.kind === "upland_game" && isHorseLikeHabitat(stock.habitat)) {
    const horseLike = hashUnit(String(world.seed), [String(stock.id), stock.habitat, "medium_herd_archetype"]) > 0.52;
    if (horseLike) {
      return {
        archetype: "wild_horses",
        label: "wild horse-like herd",
        tags: ["herd_prey", "large_game", "grazer", "seasonal_mover", "water_dependent", "hard_to_hunt", "future_domestication_candidate", "future_mount_candidate", "trackable"],
      };
    }
  }

  if (stock.kind === "forest_edge_game") {
    const wetCover = stock.habitat === "wet_woodland" || stock.habitat === "dense_cover";
    const boarish = wetCover || hashUnit(String(world.seed), [String(stock.id), "boar"]) > 0.62;
    if (boarish) {
      return {
        archetype: "boar",
        label: "boar-like omnivore stock",
        tags: ["omnivore", "solitary_prey", "high_risk", "fast_breeder", "future_domestication_candidate", "trackable"],
      };
    }
  }

  if (stock.kind === "large_game") {
    const selector = hashUnit(String(world.seed), [String(stock.id), stock.habitat, "large_game_archetype"]);
    if ((stock.habitat === "open_valley" || stock.habitat === "open_plain" || stock.habitat === "dry_country") && selector > 0.68) {
      return {
        archetype: "wild_horses",
        label: "wild horse-like herd",
        tags: ["herd_prey", "large_game", "grazer", "seasonal_mover", "water_dependent", "hard_to_hunt", "future_domestication_candidate", "future_mount_candidate", "trackable"],
      };
    }
    if (selector > 0.36) {
      return {
        archetype: "wild_cattle",
        label: "wild cattle / aurochs-like herd",
        tags: ["herd_prey", "large_game", "grazer", "dangerous_herbivore", "water_dependent", "high_yield", "high_risk", "slow_breeder", "future_herd_management_candidate", "trackable"],
      };
    }
  }

  return {
    archetype: "deer_sheep_goat_like_herd",
    label: "deer / sheep / goat-like herd prey",
    tags: ["herd_prey", "browser", "grazer", "seasonal_mover", "future_herd_management_candidate", "trackable"],
  };
}

function isHorseLikeHabitat(habitat: FaunaHabitatType): boolean {
  return habitat === "open_valley" || habitat === "open_plain" || habitat === "river_meadow" || habitat === "dry_country" || habitat === "upland_slope";
}

function getAnimalKnowledgeState(
  stock: FaunaStockGeo,
  archetype: VisibleFaunaArchetype,
  seenTileIds: readonly TileId[],
  band: Band,
  relevantTrips: readonly IntraSeasonTripRecord[],
  routeReliability: number,
): AnimalKnowledgeState {
  const successfulTrips = relevantTrips.filter(isSuccessfulTrip).length;
  const failedTrips = relevantTrips.filter(isFailedTrip).length;
  const latestTrace = relevantTrips.find((trip) => trip.animalActivityTrace !== undefined)?.animalActivityTrace;
  const latestAgeTicks = latestAnimalTripAgeTicks(band, relevantTrips);

  if (latestTrace?.knowledgeUpdate === "danger_caution_added" || (failedTrips > 0 && stock.riskPlaceholder >= 0.32)) {
    return "avoided";
  }
  if (successfulTrips >= 2 && routeReliability >= 0.5) {
    return "reliable_route";
  }
  if (successfulTrips > 0) {
    return "hunted_successfully";
  }
  if (failedTrips >= 2) {
    return "stale_route";
  }
  if (failedTrips > 0) {
    return "failed_to_find";
  }
  if (stock.riskPlaceholder >= 0.45 || archetype === "wild_cattle") {
    return "dangerous";
  }
  if (seenTileIds.includes(band.position)) {
    return seenTileIds.length >= 3 ? "repeated_sighting" : "direct_sighting";
  }
  if (seenTileIds.length >= 3 && routeReliability >= 0.42) {
    return "reliable_route";
  }
  if (latestAgeTicks !== undefined && latestAgeTicks <= 8) {
    return "recent_tracks";
  }
  return "inferred_from_tracks";
}

function latestAnimalTripAgeTicks(
  band: Band,
  relevantTrips: readonly IntraSeasonTripRecord[],
): number | undefined {
  const latest = relevantTrips[0];
  const currentTick = band.lastIntraSeasonTrip?.tick ?? latest?.tick;

  if (latest === undefined || currentTick === undefined) {
    return undefined;
  }

  return Math.max(0, Number(currentTick) - Number(latest.tick));
}

function classifyKnownness(knowledgeState: AnimalKnowledgeState): VisibleFaunaStockCard["knownness"] {
  switch (knowledgeState) {
    case "unknown":
      return "unknown";
    case "inferred_from_tracks":
      return "tracks";
    case "recent_tracks":
      return "recent_tracks";
    case "direct_sighting":
      return "sighting";
    case "repeated_sighting":
      return "repeated_sighting";
    case "hunted_successfully":
      return "successful_hunt";
    case "failed_to_find":
      return "failed_find";
    case "stale_route":
      return "stale_route";
    case "dangerous":
    case "avoided":
      return "danger_caution";
    case "reliable_route":
    case "familiar":
      return "reliable_route";
  }
}

function deriveAnimalRouteReliability(
  stock: FaunaStockGeo,
  dyn: ReturnType<typeof getFaunaStockDynamic>,
  seasonalAvailability: number,
  relevantTrips: readonly IntraSeasonTripRecord[],
  seenTileIds: readonly TileId[],
  band: Band,
): number {
  const successfulTrips = relevantTrips.filter(isSuccessfulTrip).length;
  const failedTrips = relevantTrips.filter(isFailedTrip).length;
  const currentTileBonus = seenTileIds.includes(band.position) ? 0.12 : 0;
  const repeatBonus = Math.min(0.24, successfulTrips * 0.08 + Math.max(0, seenTileIds.length - 1) * 0.04);
  const failurePenalty = Math.min(0.3, failedTrips * 0.1);
  const pressurePenalty = Math.min(0.28, dyn.disturbance * 0.2 + dyn.cumulativePressure * 0.025);

  return round2(clamp01(
    stock.detectability * 0.22 +
      stock.habitatSuitability * 0.22 +
      seasonalAvailability * 0.16 +
      repeatBonus +
      currentTileBonus -
      failurePenalty -
      pressurePenalty,
  ));
}

function classifyAnimalUsefulness(
  profile: FaunaArchetypeProfile,
  abundance: number,
  seasonalAvailability: number,
  risk: number,
  routeReliability: number,
  successfulTrips: number,
  failedTrips: number,
): VisibleFaunaStockCard["usefulness"] {
  if (abundance < 0.42) {
    return "scarce";
  }
  if (failedTrips > successfulTrips && routeReliability < 0.36) {
    return "unreliable";
  }
  if (risk >= 0.54 && (profile.tags.includes("high_yield") || successfulTrips > 0)) {
    return "risky_value";
  }
  if (profile.tags.includes("high_yield") && seasonalAvailability >= 0.74) {
    return "high_value";
  }
  if (routeReliability >= 0.48 || successfulTrips > 0) {
    return "useful";
  }
  if (seasonalAvailability >= 0.72 && abundance >= 0.64) {
    return "promising";
  }
  return "low";
}

function deriveRecentAnimalEvidence(
  stock: FaunaStockGeo,
  profile: FaunaArchetypeProfile,
  seenTileIds: readonly TileId[],
  relevantTrips: readonly IntraSeasonTripRecord[],
  animalTrace: IntraSeasonTripRecord["animalActivityTrace"],
  band: Band,
): readonly string[] {
  const evidence: string[] = [];

  if (seenTileIds.includes(band.position)) {
    evidence.push("direct sighting or fresh sign at current place");
  } else if (seenTileIds.length > 0) {
    evidence.push("tracks/signs on band-known nearby tiles");
  }
  if (seenTileIds.length >= 3) {
    evidence.push("repeated signs along a small route");
  }
  if (animalTrace !== undefined) {
    evidence.push(`${animalTrace.outcomeClass} hunt trace: ${animalTrace.knowledgeUpdate.replace(/_/g, " ")}`);
  }
  if (relevantTrips.some(isFailedTrip)) {
    evidence.push("recent failed find weakened confidence");
  }
  if (stock.riskPlaceholder >= 0.36 || profile.tags.includes("dangerous_herbivore")) {
    evidence.push("danger cue kept as caution, not constant attacks");
  }

  return uniqueStrings(evidence).slice(0, 4);
}

function derivePerceptionKinds(
  profile: FaunaArchetypeProfile,
  risk: number,
  abundance: number,
  wariness: number,
  successfulTrips: number,
  failedTrips: number,
  routeReliability: number,
  usefulness: VisibleFaunaStockCard["usefulness"],
): readonly AnimalPerceptionKind[] {
  const values: AnimalPerceptionKind[] = [];
  if (successfulTrips > 0 || profile.tags.includes("high_yield")) {
    values.push("useful");
  }
  if (risk >= 0.5 || profile.tags.includes("pack_predator") || profile.tags.includes("dangerous_herbivore")) {
    values.push("feared", "dangerous");
  }
  if (profile.tags.includes("hard_to_hunt") || profile.tags.includes("high_risk")) {
    values.push("respected");
  }
  if (wariness >= 0.4 || failedTrips > 0) {
    values.push("avoided");
  }
  if (failedTrips > successfulTrips || routeReliability < 0.24) {
    values.push("unreliable");
  }
  if (abundance < 0.45) {
    values.push("scarce");
  } else if (abundance > 0.78) {
    values.push("reliable");
  }
  if (profile.tags.includes("hard_to_hunt")) {
    values.push("hard_to_catch");
  }
  if (usefulness === "promising" || usefulness === "high_value") {
    values.push("promising");
  }
  if (usefulness === "risky_value") {
    values.push("dangerous_but_valuable");
  }
  if (profile.tags.includes("camp_follower_candidate")) {
    values.push("watched", "camp_following_candidate");
  }
  if (profile.tags.includes("future_domestication_candidate") || profile.tags.includes("future_herd_management_candidate")) {
    values.push("promising_but_not_controlled", "future_management_candidate");
  }
  return uniquePerceptions(values).slice(0, 5);
}

function topFaunaReasons(
  stock: FaunaStockGeo,
  profile: FaunaArchetypeProfile,
  seasonalAvailability: number,
  abundance: number,
  tripCount: number,
  routeReliability: number,
): readonly string[] {
  const reasons = [
    `${profile.label} signs in ${stock.habitat}`,
    stock.habitatBasis[0] ?? `habitat suitability ${round2(stock.habitatSuitability)}`,
    `seasonal availability ${round2(seasonalAvailability)}`,
  ];
  if (abundance < 0.55) {
    reasons.push("stock is perceived as scarce or disturbed");
  } else if (abundance > 0.78) {
    reasons.push("stock signs remain steady");
  }
  if (routeReliability >= 0.5) {
    reasons.push("repeated signs make the route more reliable");
  } else if (routeReliability < 0.24) {
    reasons.push("route confidence remains weak or stale");
  }
  if (tripCount > 0) {
    reasons.push("recent activity touched this stock class");
  }
  if (profile.tags.includes("water_dependent")) {
    reasons.push("water-dependent animal route");
  }
  return reasons.slice(0, 4);
}

function labelAquaticResource(card: VisibleFaunaStockCard): string {
  switch (card.sourceKind) {
    case "lake_fish":
      return "lake fish stock";
    case "river_reach_fish":
      return "river fish reach";
    case "delta_wetland_fish":
      return "wetland aquatic food";
    case "seasonal_fish_run":
      return "seasonal fish run";
    case "shellfish_reedbed":
      return "shellfish / reedbed aquatic food";
    default:
      return "aquatic food place";
  }
}

function classifyAquaticEffect(
  card: VisibleFaunaStockCard,
  pressure: number,
  recovery: number,
): VisibleAquaticResourceCard["aquaticEffect"] {
  if (pressure >= 0.46) {
    return "overfished";
  }
  if (card.sourceKind === "seasonal_fish_run" && card.seasonalAvailability > 1) {
    return "fish_pulse";
  }
  if (card.habitat === "lake" && card.seasonalAvailability >= 0.78 && card.perceivedAbundance !== "scarce") {
    return "winter_buffer";
  }
  if (card.habitat === "delta_wetland" && card.perceivedAbundance !== "scarce") {
    return "wetland_buffer";
  }
  if (recovery >= 0.52 && pressure < 0.18) {
    return "recovery";
  }
  if (card.perceivedAbundance === "scarce" || card.seasonalAvailability < 0.72) {
    return "poor_water_food";
  }
  return "routine";
}

function topAquaticReasons(
  card: VisibleFaunaStockCard,
  effect: VisibleAquaticResourceCard["aquaticEffect"],
  protoCampLink: VisibleAquaticResourceCard["protoCampLink"],
): readonly string[] {
  const reasons = [
    `${labelAquaticResource(card)} in ${card.habitat}`,
    `seasonal availability ${round2(card.seasonalAvailability)}`,
    `pressure ${round2(card.huntingOrFishingPressure)}`,
  ];
  if (effect === "fish_pulse") {
    reasons.push("seasonal fish pulse is readable");
  } else if (effect === "winter_buffer" || effect === "wetland_buffer") {
    reasons.push("aquatic food can buffer plant scarcity");
  } else if (effect === "overfished") {
    reasons.push("repeated fishing or crowding is lowering returns");
  } else if (effect === "recovery") {
    reasons.push("quiet seasons allow aquatic recovery");
  } else if (effect === "poor_water_food") {
    reasons.push("water is useful but aquatic food is weak");
  }
  if (protoCampLink !== "none") {
    reasons.push(`linked to ${protoCampLink.replace(/_/g, " ")}`);
  }
  return reasons.slice(0, 5);
}

function getAquaticProtoCampLink(
  band: Band,
  card: VisibleFaunaStockCard,
): VisibleAquaticResourceCard["protoCampLink"] {
  const current = band.protoCampMemory?.currentPlace;
  if (current !== undefined && (current.tileId === card.anchorTileId || card.seenTileIds.includes(current.tileId))) {
    return "current_place";
  }
  const known = band.protoCampMemory?.topPlaces.find((place) =>
    place.tileId === card.anchorTileId || card.seenTileIds.includes(place.tileId),
  );
  return known === undefined ? "none" : "known_place";
}

function mapPlantToResourceEcologyClass(plantClassId: PlantClassId): ResourceEcologyClassId | undefined {
  switch (plantClassId) {
    case "fruit_berry":
      return "fruits_or_pulse_plants";
    case "nuts_mast":
    case "wild_grain_seed":
      return "seeds_nuts_mast";
    case "roots_tubers_uso":
      return "roots_tubers_fallback";
    case "wetland_plant":
    case "aquatic_plant":
      return "wetland_plants";
    case "leaf_green":
      return "gathered_plants";
    case "fiber_reed":
      return "reeds_fibers";
    case "fuel_wood":
      return "fuel_wood";
    case "medicinal_toxic":
      return "medicinal_toxic_hook";
  }
}

function translatePlantKnowledgeState(
  resourceState: ResourceEcologyKnowledgeState | undefined,
  currentTile: boolean,
  pressure: number,
  patch: PlantPatch,
): VisiblePlantKnowledgeState {
  if (resourceState === "tested" || resourceState === "reliable" || resourceState === "risky" || resourceState === "avoided" || resourceState === "stale") {
    return resourceState;
  }
  if (pressure >= 0.55) {
    return "stale";
  }
  if (patch.safetyRisk === "high" || patch.safetyRisk === "unknown") {
    return "risky";
  }
  if (resourceState === "observed") {
    return "observed";
  }
  return currentTile ? "observed" : "inferred";
}

function getPlantUseStatus(
  knowledgeState: VisiblePlantKnowledgeState,
  pressure: number,
  patch: PlantPatch,
): VisiblePlantPatchCard["useStatus"] {
  if (knowledgeState === "avoided" || patch.safetyRisk === "high") {
    return "avoided";
  }
  if (pressure >= 0.5) {
    return "overused";
  }
  if (knowledgeState === "stale") {
    return "stale";
  }
  if (knowledgeState === "tested" || knowledgeState === "reliable") {
    return "used";
  }
  if (patch.safetyRisk === "unknown" || patch.safetyRisk === "moderate") {
    return "suspected";
  }
  return "watched";
}

function classifyPlantPatchEffect(
  patch: PlantPatch,
  pressure: number,
  knowledgeState: VisiblePlantKnowledgeState,
): VisiblePlantPatchCard["plantPatchEffect"] {
  if (knowledgeState === "avoided" || patch.safetyRisk === "high" || patch.safetyRisk === "unknown") {
    return "risky_or_avoided";
  }
  if (pressure >= 0.5) {
    return "overused";
  }
  if (patch.lifecycleState === "recovering" || patch.abundanceTrend === "rising") {
    return "recovering";
  }
  if (patch.fallbackRole === "important" || patch.fallbackRole === "emergency") {
    return "fallback_food";
  }
  if (patch.seasonalPulseStrength >= 0.18 || patch.abundanceTrend === "pulse_peak") {
    return "seasonal_pulse";
  }
  if (patch.currentSeasonalAvailability === "low" || patch.currentSeasonalAvailability === "absent" || patch.currentSeasonalAvailability === "dormant") {
    return "lean_scarcity";
  }
  return "routine";
}

function topPlantReasons(
  patch: PlantPatch,
  pressure: number,
  animalGrazingPressure: number,
  memorySource: string | undefined,
): readonly string[] {
  const reasons = [
    `${patch.currentSeasonalAvailability} in ${patch.plantClassId}`,
    `abundance ${round2(patch.currentAbundance)}`,
    `trend ${patch.abundanceTrend}`,
  ];
  if (patch.seasonalPulseStrength >= 0.18) {
    reasons.push("seasonal plant pulse is visible");
  }
  if (patch.lifecycleState === "recovering" || patch.naturalRecoveryProgress >= 0.24) {
    reasons.push("patch is recovering after seasonal rest");
  }
  if (pressure >= 0.28) {
    reasons.push("use pressure is lowering the patch");
  }
  if (animalGrazingPressure >= 0.18) {
    reasons.push("nearby grazer/browser signs add light plant pressure");
  }
  if (patch.fallbackRole === "important" || patch.fallbackRole === "emergency") {
    reasons.push(`${patch.fallbackRole} fallback food role`);
  }
  if (patch.laborCost >= 0.58) {
    reasons.push("food is useful but labor-costly");
  }
  if (patch.safetyRisk === "moderate" || patch.safetyRisk === "high" || patch.safetyRisk === "unknown") {
    reasons.push(`${patch.safetyRisk} plant risk hook`);
  }
  if (memorySource !== undefined) {
    reasons.push(`grounded by ${memorySource}`);
  }
  return reasons.slice(0, 5);
}

function labelForestPatch(coverType: TreeCoverType): string {
  switch (coverType) {
    case "scattered_trees":
      return "scattered trees";
    case "open_woodland":
      return "open woodland";
    case "dense_woodland":
      return "dense woodland";
    case "riparian_trees":
      return "riparian trees";
    case "wet_forest_edge":
      return "wet forest edge";
    case "scrub_tree_mix":
      return "scrub / tree mix";
    case "fruit_nut_mast_stand":
      return "fruit / mast tree stand";
    case "young_regrowth":
      return "young regrowth";
    case "declining_dieback_patch":
      return "declining tree patch";
    case "forest_edge":
      return "forest edge";
  }
}

function getForestKnowledgeState(
  currentTile: boolean,
  nearbyVisibleTile: boolean,
  rememberedPlace: boolean,
  patch: ForestPatch,
): ForestKnowledgeState {
  if (patch.growthTrend === "dieback" || patch.pressure >= 0.58) {
    return "stale";
  }
  if (patch.visibilityEffect >= 0.58 || patch.diebackTrend >= 0.46) {
    return "avoided";
  }
  if (rememberedPlace && patch.health >= 0.56) {
    return "familiar";
  }
  if (currentTile) {
    return "observed";
  }
  if (nearbyVisibleTile) {
    return "observed";
  }
  return "inferred";
}

function getForestProtoCampLink(
  band: Band,
  tileId: TileId,
): VisibleForestPatchCard["protoCampLink"] {
  const current = band.protoCampMemory?.currentPlace;
  if (current !== undefined && current.tileId === tileId) {
    return "current_place";
  }
  const known = band.protoCampMemory?.topPlaces.find((place) => place.tileId === tileId);
  return known === undefined ? "none" : "known_place";
}

function deriveForestPerception(
  patch: ForestPatch,
  linkedAnimalSigns: readonly string[],
  linkedPlantPatches: readonly string[],
  placeValences: readonly string[],
): readonly HumanForestPerception[] {
  const values: HumanForestPerception[] = [];

  if (patch.shadeRefugeValue >= 0.28 || patch.woodFuelMaterialValue >= 0.36 || patch.fruitMastLink !== "none") {
    values.push("useful");
  }
  if (patch.density >= 0.62) {
    values.push("dense");
  }
  if (patch.visibilityEffect >= 0.5) {
    values.push("poor_visibility");
  }
  if (patch.travelAccessEffect >= 0.34 || placeValences.includes("risky")) {
    values.push("risky");
  }
  if (patch.shadeRefugeValue >= 0.34) {
    values.push("sheltering");
  }
  if (linkedAnimalSigns.length > 0 || patch.animalHabitatValue >= 0.42) {
    values.push("good_for_animals");
  }
  if (linkedPlantPatches.length > 0 || patch.fruitMastLink !== "none") {
    values.push("good_for_fruits_nuts");
  }
  if (patch.pressure >= 0.42) {
    values.push("overused");
  }
  if (patch.growthTrend === "recovering" || patch.recovery >= 0.18) {
    values.push("recovering");
  }
  if (placeValences.includes("reliable")) {
    values.push("familiar");
  }
  if (values.length === 0) {
    values.push("unknown");
  }

  return uniqueForestPerceptions(values).slice(0, 6);
}

function topForestReasons(
  patch: ForestPatch,
  nearbyVisibleTile: boolean,
  linkedAnimalSigns: readonly string[],
  linkedPlantPatches: readonly string[],
  protoCampLink: VisibleForestPatchCard["protoCampLink"],
): readonly string[] {
  // WHOLE-UI-READABILITY-HISTORY-FUN-1B — these lines render on normal-UI
  // cards; the numeric density/visibility/movement fields stay on the card
  // for Technical, not in prose.
  const stand = patch.density >= 0.6
    ? `a dense stand of ${labelForestPatch(patch.coverType).toLowerCase()}`
    : patch.density >= 0.3
      ? `an open stand of ${labelForestPatch(patch.coverType).toLowerCase()}`
      : `a thin scatter of ${labelForestPatch(patch.coverType).toLowerCase()}`;
  const reasons = [
    patch.visibilityEffect >= 0.3 || patch.travelAccessEffect >= 0.2
      ? `${stand}, thick enough to hide movement and slow travel.`
      : `${stand}, easy enough to move and see through.`,
    patch.health >= 0.6
      ? `The growth looks healthy, ${patch.growthTrend.replace(/_/g, " ")}.`
      : `The growth looks strained, ${patch.growthTrend.replace(/_/g, " ")}.`,
  ];
  if (patch.fruitMastLink !== "none") {
    reasons.push(`It carries ${patch.fruitMastLink.replace(/_/g, " ")} worth checking in season.`);
  }
  if (nearbyVisibleTile) {
    reasons.push("Its tree cover is visible from where the band stands.");
  }
  if (linkedAnimalSigns.length > 0) {
    reasons.push(`Animal signs cluster around it: ${linkedAnimalSigns.join(", ")}.`);
  } else if (patch.animalHabitatValue >= 0.36) {
    reasons.push("Animals shelter and feed in this cover.");
  }
  if (linkedPlantPatches.length > 0) {
    reasons.push(`Gathering ground sits close by: ${linkedPlantPatches.join(", ")}.`);
  }
  if (patch.woodFuelMaterialValue >= 0.34) {
    reasons.push("Good wood, fuel, and fiber if they choose to work it.");
  }
  if (protoCampLink !== "none") {
    reasons.push(`It stands near ${protoCampLink.replace(/_/g, " ")}.`);
  }
  return reasons.slice(0, 6);
}

function uniqueForestPerceptions(values: readonly HumanForestPerception[]): readonly HumanForestPerception[] {
  const seen = new Set<string>();
  const out: HumanForestPerception[] = [];

  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value);
      out.push(value);
    }
  }

  return out;
}

function grazingPressureForTile(
  faunaCards: readonly VisibleFaunaStockCard[],
  tileId: TileId,
): number {
  const relevant = faunaCards.filter((card) =>
    card.seenTileIds.includes(tileId) &&
    (card.tags.includes("grazer") || card.tags.includes("browser") || card.tags.includes("omnivore")) &&
    !card.tags.includes("aquatic"),
  );

  if (relevant.length === 0) {
    return 0;
  }

  return round2(clamp01(Math.max(...relevant.map((card) =>
    card.perceivedAbundance === "abundant" ? 0.42 :
    card.perceivedAbundance === "steady" ? 0.28 :
    card.perceivedAbundance === "low" ? 0.14 :
    0.06,
  ))));
}

function getDomesticationStage(
  card: VisibleFaunaStockCard,
  contactSeasons: number,
  stablePlace: number,
  animalTolerance: number,
  failurePressure: number,
): DomesticationRelationshipStage {
  if (failurePressure >= 0.72 || contactSeasons <= 0) {
    return "wild_no_relationship";
  }
  if (contactSeasons < 3) {
    return "repeatedly_seen";
  }
  if (card.knowledgeState === "reliable_route" || card.knowledgeState === "repeated_sighting" || card.knowledgeState === "hunted_successfully" || contactSeasons < 8) {
    return "familiar_tracks_or_sightings";
  }
  if (animalTolerance >= 0.42 && stablePlace >= 0.28) {
    return card.tags.includes("camp_follower_candidate") ? "camp_following_or_managed_contact" : "tolerated_proximity";
  }
  if (animalTolerance >= 0.5 && stablePlace >= 0.45 && failurePressure < 0.34 && contactSeasons >= 18) {
    return "management_candidate";
  }
  return "familiar_tracks_or_sightings";
}

function getDomesticationPathway(card: VisibleFaunaStockCard): DomesticationTrajectoryState["pathway"] {
  if (card.tags.includes("future_mount_candidate")) {
    return "directed_locked";
  }
  if (card.tags.includes("camp_follower_candidate") || card.archetype === "boar") {
    return "commensal_proximity";
  }
  if (card.tags.includes("future_herd_management_candidate") || card.tags.includes("herd_prey")) {
    return "prey_management";
  }
  return "none";
}

function getDomesticationFailureReasons(
  card: VisibleFaunaStockCard,
  stablePlace: number,
  huntingPressure: number,
  failurePressure: number,
): readonly string[] {
  const reasons: string[] = [];
  if (card.risk >= 0.48) {
    reasons.push("aggression or danger remains high");
  }
  if (huntingPressure >= 0.28) {
    reasons.push("repeated hunting raises wariness");
  }
  if (stablePlace < 0.2) {
    reasons.push("no stable camp-like place for repeated contact");
  }
  if (card.humanTolerance < 0.28) {
    reasons.push("animal flight distance or human caution remains high");
  }
  if (failurePressure >= 0.5) {
    reasons.push("relationship is more likely to stall than progress");
  }
  if (reasons.length === 0) {
    reasons.push("long-term contact is still too shallow for control");
  }
  return reasons.slice(0, 5);
}

function explicitDomesticationLimits(card: VisibleFaunaStockCard): readonly string[] {
  const limits = ["no domestic animals yet", "no breeding control", "no ownership or herding economy"];
  if (card.tags.includes("future_mount_candidate")) {
    return [...limits, "future mount candidate only: no riding or mount bonus"];
  }
  if (card.archetype === "wolves") {
    return [...limits, "no dogs or hunting bonus yet"];
  }
  return limits;
}

function describeNatureHeadline(
  faunaCards: readonly VisibleFaunaStockCard[],
  aquaticCards: readonly VisibleAquaticResourceCard[],
  plantCards: readonly VisiblePlantPatchCard[],
  forestCards: readonly VisibleForestPatchCard[],
  acuteEpisodes: readonly AcuteRiskEpisode[],
): string {
  const acute = acuteEpisodes[0];
  if (acute !== undefined && acute.severity >= 0.55) {
    return `${acute.kind.replace(/_/g, " ")} is shaping caution.`;
  }
  if (faunaCards.some((card) => card.tags.includes("pack_predator") || card.risk >= 0.55)) {
    return "Animal signs are making nearby work riskier.";
  }
  const aquatic = aquaticCards.find((card) =>
    card.aquaticEffect === "fish_pulse" ||
    card.aquaticEffect === "wetland_buffer" ||
    card.aquaticEffect === "winter_buffer" ||
    card.aquaticEffect === "overfished",
  );
  if (aquatic !== undefined) {
    if (aquatic.aquaticEffect === "overfished") {
      return "A known water-edge food place is under pressure.";
    }
    return "Known aquatic food helps explain this water edge.";
  }
  const forest = forestCards.find((card) =>
    card.coverType === "dense_woodland" ||
    card.coverType === "riparian_trees" ||
    card.fruitMastLink !== "none" ||
    card.visibilityEffect >= 0.48,
  );
  if (forest !== undefined) {
    if (forest.visibilityEffect >= 0.48) {
      return `${forest.label} is changing visibility and movement.`;
    }
    if (forest.fruitMastLink !== "none") {
      return `${forest.label} links this place to fruit or mast resources.`;
    }
    return `${forest.label} helps explain this place.`;
  }
  if (plantCards.some((card) => card.seasonalAvailability === "active" && card.abundance >= 0.5)) {
    return "Visible plant patches help explain nearby returns.";
  }
  if (faunaCards.length > 0) {
    return "Animal tracks and sightings are now readable here.";
  }
  return "No strong animal or plant signs are known yet.";
}

function describePlantHeadline(plantCards: readonly VisiblePlantPatchCard[]): string {
  const overused = plantCards.find((card) => card.useStatus === "overused");
  if (overused !== undefined) {
    return `${overused.label} is known but overused.`;
  }
  const fallback = plantCards.find((card) => card.plantPatchEffect === "fallback_food" && card.pressure >= 0.12);
  if (fallback !== undefined) {
    return `${fallback.label} is helping as a costly fallback food.`;
  }
  const pulse = plantCards.find((card) => card.topReasons.some((reason) => reason.includes("pulse")));
  if (pulse !== undefined) {
    return `${pulse.label} is in a seasonal pulse.`;
  }
  const lean = plantCards.find((card) => card.plantPatchEffect === "lean_scarcity");
  if (lean !== undefined) {
    return `${lean.label} is visible but seasonally scarce.`;
  }
  const top = plantCards[0];
  return top === undefined ? "No visible plant patch is prominent." : `${top.label} is the clearest known plant patch.`;
}

function describeAnimalHeadline(faunaCards: readonly VisibleFaunaStockCard[]): string {
  const dangerous = faunaCards.find((card) => card.risk >= 0.55);
  if (dangerous !== undefined) {
    return `${dangerous.label} are readable as dangerous signs.`;
  }
  const top = faunaCards[0];
  return top === undefined ? "No animal stock is readable yet." : `${top.label} signs are visible.`;
}

function describeAquaticHeadline(aquaticCards: readonly VisibleAquaticResourceCard[]): string {
  const pressured = aquaticCards.find((card) => card.aquaticEffect === "overfished");
  if (pressured !== undefined) {
    return `${pressured.label} is useful but under pressure.`;
  }
  const pulse = aquaticCards.find((card) => card.aquaticEffect === "fish_pulse");
  if (pulse !== undefined) {
    return `${pulse.label} is in a seasonal pulse.`;
  }
  const buffer = aquaticCards.find((card) => card.aquaticEffect === "wetland_buffer" || card.aquaticEffect === "winter_buffer");
  if (buffer !== undefined) {
    return `${buffer.label} can buffer lean plant seasons.`;
  }
  const poor = aquaticCards.find((card) => card.aquaticEffect === "poor_water_food");
  if (poor !== undefined) {
    return `${poor.label} is known, but returns look weak.`;
  }
  const top = aquaticCards[0];
  return top === undefined ? "No aquatic food place is readable yet." : `${top.label} is the clearest known water-edge food.`;
}

function getRelevantAnimalTrips(
  band: Band,
  faunaClass: FaunaClass,
  influenceTileIds: readonly TileId[],
): readonly IntraSeasonTripRecord[] {
  return (band.recentIntraSeasonTrips ?? []).filter((trip) => {
    const classMatch = faunaClass === "aquatic_food"
      ? trip.taskGroupType === "fishing_group" || trip.resourceClassId === "aquatic_food"
      : trip.taskGroupType === "hunting_group" || trip.resourceClassId === "animal_food";
    return classMatch && influenceTileIds.includes(trip.targetTileId);
  });
}

function getRelevantAnimalTripsBySeenTiles(
  band: Band,
  seenTileIds: readonly TileId[],
): readonly IntraSeasonTripRecord[] {
  return (band.recentIntraSeasonTrips ?? []).filter((trip) =>
    seenTileIds.includes(trip.targetTileId) &&
    (trip.taskGroupType === "hunting_group" || trip.taskGroupType === "fishing_group" || trip.taskGroupType === "local_foraging_group"),
  );
}

function isSuccessfulTrip(trip: IntraSeasonTripRecord): boolean {
  return trip.activityOutcome === "successful_observation" ||
    trip.activityOutcome === "target_found" ||
    trip.activityOutcome === "partial_success" ||
    trip.activityOutcome === "returned_with_information";
}

function isFailedTrip(trip: IntraSeasonTripRecord): boolean {
  return trip.activityOutcome === "target_not_found" ||
    trip.activityOutcome === "failed_due_to_distance" ||
    trip.activityOutcome === "failed_due_to_water_risk" ||
    trip.activityOutcome === "failed_due_to_low_memory_confidence" ||
    trip.activityOutcome === "failed_due_to_season_mismatch" ||
    trip.activityOutcome === "abandoned_due_to_risk" ||
    trip.activityOutcome === "delayed_return";
}

function proximityCampSignal(band: Band, tileId: TileId): number {
  const current = band.protoCampMemory?.currentPlace;
  if (current !== undefined && current.tileId === tileId) {
    return current.campLikeScore;
  }
  return band.protoCampMemory?.topPlaces.find((place) => place.tileId === tileId)?.campLikeScore ?? 0;
}

function estimateContactSeasons(world: WorldState, band: Band, card: VisibleFaunaStockCard): number {
  const tripSeasons = getRelevantAnimalTripsBySeenTiles(band, card.seenTileIds).length;
  const campSeasons = band.protoCampMemory?.topPlaces.find((place) => place.tileId === card.anchorTileId)?.visitCount ?? 0;
  const directSeen = card.seenTileIds.includes(band.position) ? 1 : 0;
  return Math.min(40, tripSeasons + campSeasons + directSeen + Math.floor(card.confidence * 4));
}

function abundanceBand(abundance: number): VisibleFaunaStockCard["perceivedAbundance"] {
  if (abundance < 0.38) {
    return "scarce";
  }
  if (abundance < 0.6) {
    return "low";
  }
  if (abundance > 0.82) {
    return "abundant";
  }
  return "steady";
}

function perceivedAbundanceValue(abundance: VisibleFaunaStockCard["perceivedAbundance"]): number {
  switch (abundance) {
    case "scarce":
      return 0.18;
    case "low":
      return 0.42;
    case "abundant":
      return 0.88;
    case "steady":
      return 0.66;
  }
}

function isOpenExposureTile(tile: Tile | undefined): boolean {
  return tile?.terrainKind === "plains" || tile?.terrainKind === "desert" || tile?.terrainKind === "tundra";
}

function compareFaunaCards(left: VisibleFaunaStockCard, right: VisibleFaunaStockCard): number {
  return right.confidence - left.confidence ||
    right.risk - left.risk ||
    left.label.localeCompare(right.label) ||
    left.stockId.localeCompare(right.stockId);
}

function compareBands(left: Band, right: Band): number {
  return String(left.id).localeCompare(String(right.id));
}

function uniqueTileIds(values: readonly TileId[]): readonly TileId[] {
  const seen = new Set<string>();
  const result: TileId[] = [];
  for (const value of values) {
    const key = String(value);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(value);
  }
  return result;
}

function uniquePerceptions(values: readonly AnimalPerceptionKind[]): readonly AnimalPerceptionKind[] {
  const seen = new Set<string>();
  const result: AnimalPerceptionKind[] = [];
  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }
    seen.add(value);
    result.push(value);
  }
  return result;
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }
    seen.add(value);
    result.push(value);
  }
  return result;
}

function stageRank(stage: DomesticationRelationshipStage): number {
  const order: readonly DomesticationRelationshipStage[] = [
    "wild_no_relationship",
    "repeatedly_seen",
    "familiar_tracks_or_sightings",
    "tolerated_proximity",
    "camp_following_or_managed_contact",
    "low_aggression_lineage",
    "primitive_relationship",
    "management_candidate",
    "domestication_candidate",
  ];
  return order.indexOf(stage);
}

function collectNatureReasonIds(
  world: WorldState,
  band: Band,
  faunaCards: readonly VisibleFaunaStockCard[],
  aquaticCards: readonly VisibleAquaticResourceCard[],
  plantCards: readonly VisiblePlantPatchCard[],
  forestCards: readonly VisibleForestPatchCard[],
  acuteEpisodes: readonly AcuteRiskEpisode[],
): readonly ReasonId[] {
  return [
    `reason:visible-nature:${band.id}:${world.time.tick}:candidate_tiles:${band.position}` as ReasonId,
    ...faunaCards.slice(0, 4).map((card) =>
      `reason:visible-nature:${band.id}:${world.time.tick}:fauna:${card.stockId}` as ReasonId,
    ),
    ...aquaticCards.slice(0, 3).map((card) =>
      `reason:visible-nature:${band.id}:${world.time.tick}:aquatic:${card.stockId}` as ReasonId,
    ),
    ...plantCards.slice(0, 4).map((card) =>
      `reason:visible-nature:${band.id}:${world.time.tick}:plant:${card.patchId}` as ReasonId,
    ),
    ...forestCards.slice(0, 4).map((card) =>
      `reason:visible-nature:${band.id}:${world.time.tick}:forest:${card.patchId}` as ReasonId,
    ),
    ...acuteEpisodes.flatMap((episode) => episode.reasonIds.slice(0, 2)),
  ].slice(0, 16);
}

function hashUnit(seed: string, parts: readonly (string | number)[]): number {
  return hashParts(seed, parts) / 4294967296;
}

function hashParts(seed: string, parts: readonly (string | number)[]): number {
  let hash = 2166136261 ^ hashString(seed);

  for (const part of parts) {
    if (typeof part === "number") {
      hash ^= part | 0;
      hash = Math.imul(hash, 16777619);
    } else {
      for (let index = 0; index < part.length; index += 1) {
        hash ^= part.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
      }
    }
    hash ^= hash >>> 13;
    hash = Math.imul(hash, 2246822519);
  }

  return hash >>> 0;
}

function hashString(value: string): number {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function getGridDistance(left: Tile | undefined, right: Tile | undefined): number {
  if (left === undefined || right === undefined) {
    return Number.MAX_SAFE_INTEGER;
  }
  return Math.abs(left.coord.x - right.coord.x) + Math.abs(left.coord.y - right.coord.y);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
