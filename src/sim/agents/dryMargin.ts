import { getSalientMemorySummary, type TickContextCache } from "./contextCache";
import type {
  Band,
  BehaviorBasis,
  DryMarginMobilityContext,
  DryMarginSeasonalMode,
  RiverCorridorProspect,
  RiverCorridorProspectBasis,
  RiverProspectDirection,
  SeasonalMobilityModeState,
  StayMoveScoutComparison,
  WaterRefugeProfile,
  WaterSourceKind,
} from "./types";
import type { ReasonId, Season, TileId, WorldTime } from "../core/types";
import type { KnownTileRecord } from "../knowledge/types";
import { getRiverCrossingForMovement, getRiverProfile } from "../world/hydrography";
import { getSeasonalTileConditions } from "../world/seasonal";
import { getNeighborTiles, getTile } from "../world/generate";
import type { Tile, WorldState } from "../world/types";
import { getCanonicalFoodStress } from "./seasonalSurvival";

const MAX_WATER_CANDIDATES = 8;
const MAX_PROSPECT_CANDIDATES = 10;
// Hard ceiling on how far resource-belief curiosity can lower the logistical-probe
// scout-value bar (2K.1F). Small so beliefs nudge probing "slightly", never flip it.
// EMPIRICAL CALIBRATION CONSTANT (2K.1F; audited 2K.1F-A), not a historical law.
const BELIEF_PROBE_THRESHOLD_RELAXATION_CAP = 0.03;

interface ProspectCandidate {
  readonly tileId: TileId;
  readonly record?: KnownTileRecord;
  readonly tile?: Tile;
  readonly distance: number;
  readonly expectedWater: number;
  readonly expectedFood: number;
  readonly travelCost: number;
  readonly uncertainty: number;
  readonly socialAccessRisk: number;
  readonly crossingRisk: number;
  readonly corridorStrength: number;
  readonly direction: RiverProspectDirection;
  readonly basis: readonly RiverCorridorProspectBasis[];
  readonly confidence: number;
}

export function deriveDryMarginMobilityContext(
  world: WorldState,
  band: Band,
  contextCache?: TickContextCache,
  // Resource-belief probe pressure (2K.1F): a small, hard-capped nudge that widens
  // logistical-probe availability when the band believes resources exist elsewhere.
  // Probe (scout-before-relocation, residence-unchanged) only — never relocation,
  // and it never overrides the water prospect's own existence/strength requirements.
  beliefProbePressure = 0,
): DryMarginMobilityContext | undefined {
  if (!isDryMarginRelevantBand(world, band)) {
    return undefined;
  }

  const currentTile = getTile(world, band.position);
  const currentRecord = band.knowledge.observedTiles[band.position];

  if (currentTile === undefined || currentRecord === undefined) {
    return undefined;
  }

  const currentWaterRefuge = buildWaterRefugeProfile(world, band, currentTile, currentRecord, 0, contextCache);
  const bestWaterCandidates = getBestWaterCandidates(world, band, contextCache);
  const seasonalMode = deriveSeasonalMobilityMode(world, band, currentWaterRefuge, bestWaterCandidates);
  const riverProspect = deriveRiverCorridorProspect(world, band, currentTile, currentRecord, contextCache);
  const stayMoveScout = deriveStayMoveScoutComparison(
    world,
    band,
    currentWaterRefuge,
    bestWaterCandidates,
    seasonalMode,
    riverProspect,
  );
  const currentPlaceAssessment = getCurrentPlaceAssessment(band, currentWaterRefuge, seasonalMode, stayMoveScout);
  const logisticalProbeAvailable = isLogisticalProbeAvailable(band, seasonalMode, riverProspect, stayMoveScout, beliefProbePressure);
  const logisticalProbeSelected =
    logisticalProbeAvailable &&
    stayMoveScout.scoutValue > stayMoveScout.stayValue * 0.86 &&
    stayMoveScout.moveValue <= stayMoveScout.stayValue + stayMoveScout.departureThreshold;

  return {
    currentWaterRefuge,
    bestWaterCandidates,
    seasonalMode,
    riverProspect,
    stayMoveScout,
    logisticalProbeAvailable,
    logisticalProbeSelected,
    currentPlaceAssessment,
    reasonIds: [
      makeDryMarginReasonId(world.time, band, "water-refuge"),
      makeDryMarginReasonId(world.time, band, "seasonal-mode"),
      makeDryMarginReasonId(world.time, band, "stay-move-scout"),
    ],
  };
}

export function getDryMarginAttachmentMultiplier(
  context: DryMarginMobilityContext | undefined,
): number {
  const comparison = context?.stayMoveScout;
  const seasonalMode = context?.seasonalMode;

  if (comparison === undefined || seasonalMode === undefined) {
    return 1;
  }

  const declinePressure = clamp01(
    Math.max(0, 0.52 - comparison.currentMarginalReturn) * 0.52 +
      seasonalMode.droughtSeverity * 0.28 +
      Math.max(0, comparison.scoutValue - comparison.stayValue) * 0.26 +
      Math.max(0, comparison.moveValue - comparison.stayValue) * 0.2,
  );

  return round2(clamp01(1 - declinePressure * 0.62));
}

// Dry-margin relevance is emergent, not name-locked (2I.5, PART 5). It triggers on
// current ecology, learned adaptation/memory, or pressure — the spawn profile is
// only ONE of several debug-seed signals, never the sole gate. A band that has
// never seen arid land does not get dry-margin behaviour from its name.
function isDryMarginRelevantBand(world: WorldState, band: Band): boolean {
  return getDryMarginRelevanceBasis(world, band).length > 0;
}

// Returns WHY a band is treated as dry-margin-relevant, so the basis is legible:
// current ecology, biome adaptation, learned memory (anchor/round), pressure, or
// the initial debug-seed profile. Empty array means "not dry-margin-relevant".
export function getDryMarginRelevanceBasis(
  world: WorldState,
  band: Band,
): readonly BehaviorBasis[] {
  const currentTile = getTile(world, band.position);
  const basis: BehaviorBasis[] = [];

  if (
    currentTile?.biomeKind === "arid" ||
    currentTile?.terrainKind === "desert" ||
    (currentTile?.riskProfile.droughtRisk ?? 0) > 0.48
  ) {
    basis.push("current_ecology");
  }

  // Learned adaptation: the band has built competence in arid biomes.
  const aridCompetence = band.biomeAdaptation.records.arid;

  if (aridCompetence !== undefined && (aridCompetence.familiarity > 0.3 || aridCompetence.competence > 0.3)) {
    basis.push("biome_adaptation");
  }

  // Learned memory: it already holds a water-tethered anchor or a seasonal round.
  if (band.residentialAnchor?.tetheringWaterTileId !== undefined || band.seasonalRound !== undefined) {
    basis.push("learned_memory");
  }

  if (band.seasonalRound !== undefined) {
    basis.push("seasonal_round");
  }

  if (band.currentIntent?.kind === "seek_better_water" || (band.pressureState?.waterStress ?? 0) > 0.5) {
    basis.push("pressure_state");
  }

  // Debug-seed bias only — never the sole determinant of behaviour.
  if (band.initialSpawnReason?.profileRole === "dry_margin_foragers") {
    basis.push("starting_profile");
  }

  return basis;
}

function getBestWaterCandidates(
  world: WorldState,
  band: Band,
  contextCache?: TickContextCache,
): readonly WaterRefugeProfile[] {
  const currentTile = getTile(world, band.position);

  if (currentTile === undefined) {
    return [];
  }

  const candidateIds = getSalientCandidateTileIds(world, band, contextCache);

  return candidateIds
    .map((tileId) => {
      const tile = getTile(world, tileId);
      const record = band.knowledge.observedTiles[tileId];

      return tile === undefined || record === undefined
        ? undefined
        : buildWaterRefugeProfile(world, band, tile, record, getGridDistance(currentTile, tile), contextCache);
    })
    .filter((profile): profile is WaterRefugeProfile => profile !== undefined)
    .filter((profile) => profile.reliability > 0.36 || profile.drySeasonReliability > 0.34)
    .sort(compareWaterRefugeProfiles)
    .slice(0, MAX_WATER_CANDIDATES);
}

function buildWaterRefugeProfile(
  world: WorldState,
  band: Band,
  tile: Tile,
  record: KnownTileRecord,
  distance: number,
  contextCache?: TickContextCache,
): WaterRefugeProfile {
  const seasonal = record.observedSeasonalPattern;
  const waterAccess = record.observedWaterAccess ?? 0.32;
  const sourceKind = classifyWaterSource(world, tile, record);
  const conditions = getSeasonalTileConditions(world, tile);
  const drySeasonReliability = clamp01(
    waterAccess * 0.5 +
      (seasonal?.reliability ?? 0.42) * 0.26 +
      (sourceKind === "permanent_refuge_water" || sourceKind === "spring_or_seep" ? 0.2 : 0) +
      (sourceKind === "river_channel" || sourceKind === "lake_margin" ? 0.12 : 0) -
      tile.riskProfile.droughtRisk * 0.22,
  );
  const wetSeasonReliability = clamp01(
    waterAccess * 0.42 +
      (seasonal?.peakSeasons.includes("spring") === true ? 0.14 : 0) +
      (sourceKind === "ephemeral_rain_pool" || sourceKind === "seasonal_pool" ? 0.24 : 0) +
      (seasonal?.reliability ?? 0.42) * 0.22 -
      tile.riskProfile.floodRisk * 0.06,
  );
  const socialAccessRisk = getSocialAccessRisk(world, band, tile.id, contextCache);
  const reliability = clamp01(
    waterAccess * 0.44 +
      drySeasonReliability * 0.28 +
      wetSeasonReliability * 0.16 +
      record.confidence * 0.12 -
      conditions.currentDroughtStress * 0.12,
  );
  const fallbackRank = getFallbackRank(sourceKind, drySeasonReliability, distance, socialAccessRisk);

  return {
    tileId: tile.id,
    sourceKind,
    knowledgeSource: record.knowledgeSource,
    reliability: round2(reliability),
    drySeasonReliability: round2(drySeasonReliability),
    wetSeasonReliability: round2(wetSeasonReliability),
    droughtFailureRisk: round2(clamp01(tile.riskProfile.droughtRisk * 0.68 + (1 - drySeasonReliability) * 0.24)),
    lastKnownWaterConfidence: round2(clamp01(record.confidence * (seasonal?.confidence ?? 0.7))),
    fallbackRank,
    socialAccessRisk: round2(socialAccessRisk),
    travelCostFromCurrent: round2(clamp01(distance / 8 + (record.observedMovementCost ?? tile.movementCost) / 8)),
    inferred: record.knowledgeSource !== "personally_observed",
    reasonIds: [makeDryMarginReasonId(world.time, band, `water:${tile.id}`)],
  };
}

function classifyWaterSource(
  world: WorldState,
  tile: Tile,
  record: KnownTileRecord,
): WaterSourceKind {
  const waterAccess = record.observedWaterAccess ?? 0;
  const reliability = record.observedSeasonalPattern?.reliability ?? tile.seasonalProfile.reliability;
  const riverProfile = getRiverProfile(world, tile.riverSegmentId);

  if (waterAccess < 0.22 || reliability < 0.2) {
    return "failed_or_unreliable_water";
  }

  if (tile.isEstuary || riverProfile?.kind === "estuary") {
    return "river_channel";
  }

  if (tile.terrainKind === "lake") {
    return "lake_margin";
  }

  if (tile.terrainKind === "wetlands" || tile.isMarshChannel) {
    return "marsh_edge";
  }

  if (tile.isRiver || tile.isRiverbank || tile.terrainKind === "river_valley") {
    return "river_channel";
  }

  if (tile.isFloodplain) {
    return "floodplain_moisture";
  }

  if (waterAccess > 0.66 && reliability > 0.6 && tile.riskProfile.droughtRisk < 0.46) {
    return "permanent_refuge_water";
  }

  if (waterAccess > 0.58 && reliability > 0.52) {
    return "spring_or_seep";
  }

  if (tile.terrainKind === "desert" || tile.biomeKind === "arid" || tile.terrainKind === "hills") {
    return waterAccess > 0.36 ? "wadi_or_dry_channel" : "ephemeral_rain_pool";
  }

  return reliability > 0.38 ? "seasonal_pool" : "unknown";
}

function deriveSeasonalMobilityMode(
  world: WorldState,
  band: Band,
  currentWaterRefuge: WaterRefugeProfile,
  bestWaterCandidates: readonly WaterRefugeProfile[],
): SeasonalMobilityModeState {
  const currentTile = getTile(world, band.position);
  const conditions = currentTile === undefined ? undefined : getSeasonalTileConditions(world, currentTile);
  const droughtSeverity = clamp01(
    (conditions?.currentDroughtStress ?? 0) * 0.52 +
      (band.pressureState?.waterStress ?? 0) * 0.34 +
      currentWaterRefuge.droughtFailureRisk * 0.2,
  );
  const bestDryRefugeReliability = bestWaterCandidates[0]?.drySeasonReliability ?? currentWaterRefuge.drySeasonReliability;
  const temporaryWaterOpportunity = clamp01(
    bestWaterCandidates.filter((candidate) =>
      candidate.sourceKind === "seasonal_pool" ||
      candidate.sourceKind === "ephemeral_rain_pool" ||
      candidate.sourceKind === "wadi_or_dry_channel")
      .reduce((best, candidate) => Math.max(best, candidate.wetSeasonReliability - candidate.travelCostFromCurrent * 0.14), 0),
  );
  const dryRefugePull = clamp01(
    bestDryRefugeReliability * 0.58 +
      droughtSeverity * 0.34 -
      currentWaterRefuge.drySeasonReliability * 0.12,
  );
  // Harvest opportunity is band evidence: completed physical receipts plus
  // known temporary-water opportunity.  Static seasonal habitat potential may
  // still describe the weather, but it is not a current-food authority.
  const harvestOpportunity = clamp01(
    (band.seasonalSupport?.currentSeasonSupport.clampedSupportRatio ?? 0) * 0.74 +
      temporaryWaterOpportunity * 0.26,
  );
  const mode = getSeasonalMode(world.time.season, droughtSeverity, dryRefugePull, temporaryWaterOpportunity, harvestOpportunity);

  return {
    bandId: band.id,
    season: world.time.season,
    mode,
    waterContraction: round2(clamp01(droughtSeverity * 0.62 + dryRefugePull * 0.22)),
    temporaryWaterOpportunity: round2(temporaryWaterOpportunity),
    dryRefugePull: round2(dryRefugePull),
    harvestOpportunity: round2(harvestOpportunity),
    droughtSeverity: round2(droughtSeverity),
    confidence: round2(clamp01(currentWaterRefuge.lastKnownWaterConfidence * 0.48 + 0.36)),
    reasonIds: [makeDryMarginReasonId(world.time, band, `seasonal:${mode}`)],
  };
}

function getSeasonalMode(
  season: Season,
  droughtSeverity: number,
  dryRefugePull: number,
  temporaryWaterOpportunity: number,
  harvestOpportunity: number,
): DryMarginSeasonalMode {
  if (droughtSeverity > 0.74 && dryRefugePull > 0.44) {
    return "drought_emergency";
  }

  if (season === "spring" && temporaryWaterOpportunity > 0.28) {
    return "wet_season_dispersal";
  }

  if (season === "summer") {
    return harvestOpportunity > 0.55 ? "green_season_harvest" : "dry_season_consolidation";
  }

  if (season === "autumn" && dryRefugePull > 0.34) {
    return "late_dry_refuge";
  }

  return "normal";
}

function deriveRiverCorridorProspect(
  world: WorldState,
  band: Band,
  currentTile: Tile,
  currentRecord: KnownTileRecord,
  contextCache?: TickContextCache,
): RiverCorridorProspect | undefined {
  const candidates = collectProspectCandidates(world, band, currentTile, currentRecord, contextCache);

  if (candidates.length === 0) {
    return undefined;
  }

  const best = candidates[0];
  const basis = uniqueStrings(candidates.flatMap((candidate) => candidate.basis)) as readonly RiverCorridorProspectBasis[];
  const expectedWater = round2(clamp01(candidates.reduce((bestWater, candidate) => Math.max(bestWater, candidate.expectedWater), 0)));
  const expectedFood = round2(clamp01(candidates.reduce((bestFood, candidate) => Math.max(bestFood, candidate.expectedFood), 0)));
  const prospectStrength = round2(
    clamp01(
      best.expectedWater * 0.34 +
        best.expectedFood * 0.28 +
        best.corridorStrength * 0.2 +
        best.confidence * 0.08 -
        best.travelCost * 0.16 -
        best.uncertainty * 0.12 -
        best.crossingRisk * 0.16 -
        best.socialAccessRisk * 0.1,
    ),
  );

  return {
    bandId: band.id,
    currentTileId: currentTile.id,
    corridorDirection: best.direction,
    candidateTileIds: candidates.map((candidate) => candidate.tileId),
    bestProspectTileId: best.tileId,
    expectedWater,
    expectedFood,
    travelCost: round2(best.travelCost),
    uncertainty: round2(best.uncertainty),
    socialAccessRisk: round2(best.socialAccessRisk),
    crossingRisk: round2(best.crossingRisk),
    prospectStrength,
    confidence: round2(clamp01(best.confidence * 0.7 + (1 - best.uncertainty) * 0.3)),
    basis,
    reasonIds: [makeDryMarginReasonId(world.time, band, `river-prospect:${best.tileId}`)],
  };
}

function collectProspectCandidates(
  world: WorldState,
  band: Band,
  currentTile: Tile,
  currentRecord: KnownTileRecord,
  contextCache?: TickContextCache,
): readonly ProspectCandidate[] {
  const knownCandidateIds = getSalientCandidateTileIds(world, band, contextCache)
    .filter((tileId) => tileId !== currentTile.id);
  const unknownEdgeCandidates = currentTile.neighbors
    .filter((tileId) => band.knowledge.observedTiles[tileId] === undefined)
    .map((tileId) => buildInferredFrontierProspect(world, band, currentTile, currentRecord, tileId))
    .filter((candidate): candidate is ProspectCandidate => candidate !== undefined);
  const knownCandidates = knownCandidateIds
    .map((tileId) => buildKnownProspectCandidate(world, band, currentTile, tileId, contextCache))
    .filter((candidate): candidate is ProspectCandidate => candidate !== undefined);

  return [...knownCandidates, ...unknownEdgeCandidates]
    .filter((candidate) => candidate.corridorStrength > 0.12 || candidate.expectedWater > 0.5)
    .sort(compareProspectCandidates)
    .slice(0, MAX_PROSPECT_CANDIDATES);
}

function buildKnownProspectCandidate(
  world: WorldState,
  band: Band,
  currentTile: Tile,
  tileId: TileId,
  contextCache?: TickContextCache,
): ProspectCandidate | undefined {
  const tile = getTile(world, tileId);
  const record = band.knowledge.observedTiles[tileId];

  if (tile === undefined || record === undefined || tile.isAquatic) {
    return undefined;
  }

  const distance = getGridDistance(currentTile, tile);

  if (distance === 0 || distance > 8) {
    return undefined;
  }

  const crossing = getRiverCrossingForMovement(world, currentTile.id, tile.id);
  const basis = getProspectBasis(tile, record, crossing !== undefined);
  const corridorStrength = getCorridorStrength(currentTile, tile, basis);
  const expectedWater = clamp01(record.observedWaterAccess ?? 0.34);
  const expectedFood = clamp01(
    record.observedRichness * 0.56 +
      record.observedAquaticPotential * 0.18 +
      (record.observedSeasonalPattern?.reliability ?? 0.42) * 0.18,
  );
  const crossingRisk = crossing?.risk ?? 0;

  return {
    tileId: tile.id,
    tile,
    record,
    distance,
    expectedWater,
    expectedFood,
    travelCost: clamp01(distance / 8 + (record.observedMovementCost ?? tile.movementCost) / 6),
    uncertainty: clamp01(1 - record.confidence + (record.knowledgeSource === "personally_observed" ? 0 : 0.12)),
    socialAccessRisk: getSocialAccessRisk(world, band, tile.id, contextCache),
    crossingRisk,
    corridorStrength,
    direction: getProspectDirection(currentTile, tile, basis),
    basis,
    confidence: record.confidence,
  };
}

function buildInferredFrontierProspect(
  world: WorldState,
  band: Band,
  currentTile: Tile,
  currentRecord: KnownTileRecord,
  targetTileId: TileId,
): ProspectCandidate | undefined {
  const targetTile = getTile(world, targetTileId);

  if (targetTile === undefined || targetTile.isAquatic) {
    return undefined;
  }

  const crossing = getRiverCrossingForMovement(world, currentTile.id, targetTileId);
  const knownCorridor =
    currentTile.isRiverbank ||
    currentTile.isFloodplain ||
    currentTile.terrainKind === "river_valley" ||
    currentTile.terrainKind === "desert" ||
    currentTile.biomeKind === "arid";

  if (!knownCorridor && crossing === undefined) {
    return undefined;
  }

  const basis: readonly RiverCorridorProspectBasis[] = currentTile.isRiverbank || currentTile.isFloodplain
    ? ["inferred_downstream_continuity", "known_floodplain_edge"]
    : ["wadi_or_dry_channel_continuity"];

  return {
    tileId: targetTileId,
    tile: targetTile,
    distance: 1,
    expectedWater: clamp01((currentRecord.observedWaterAccess ?? 0.34) * 0.82 + (currentTile.isRiverbank ? 0.12 : 0)),
    expectedFood: clamp01(currentRecord.observedRichness * 0.82 + currentRecord.observedAquaticPotential * 0.1),
    travelCost: clamp01(currentTile.movementCost / 5 + (crossing?.baseCrossingCost ?? 0) / 4),
    uncertainty: 0.72,
    socialAccessRisk: 0.46,
    crossingRisk: crossing?.risk ?? 0,
    corridorStrength: currentTile.isRiverbank || currentTile.isFloodplain ? 0.58 : 0.42,
    direction: currentTile.isRiverbank || currentTile.isFloodplain ? "downstream" : "wadi_chain",
    basis,
    confidence: 0.34,
  };
}

function deriveStayMoveScoutComparison(
  world: WorldState,
  band: Band,
  currentWaterRefuge: WaterRefugeProfile,
  bestWaterCandidates: readonly WaterRefugeProfile[],
  seasonalMode: SeasonalMobilityModeState,
  riverProspect: RiverCorridorProspect | undefined,
): StayMoveScoutComparison {
  const currentTile = getTile(world, band.position);
  const currentRecord = band.knowledge.observedTiles[band.position];
  const currentUsePressure = band.usePressure[band.position];
  const localUsePressure = currentUsePressure === undefined
    ? 0
    : Math.max(currentUsePressure.foragingPressure, currentUsePressure.waterPressure, currentUsePressure.aquaticPressure);
  const placeAttachment = band.placeMemory[band.position]?.attachment ?? 0;
  const currentFood = clamp01(
    (band.seasonalSupport?.currentSeasonSupport.clampedSupportRatio ?? 0) * 0.58 +
      (1 - getCanonicalFoodStress(band)) * 0.22 +
      (currentRecord?.confidence ?? 0) * 0.08,
  );
  const currentMarginalReturn = clamp01(
    currentFood * 0.44 +
      currentWaterRefuge.reliability * 0.32 +
      currentWaterRefuge.drySeasonReliability * 0.16 -
      localUsePressure * 0.34 -
      (band.pressureState?.foodStress ?? 0) * 0.16 -
      (band.pressureState?.waterStress ?? 0) * 0.12,
  );
  const bestWater = bestWaterCandidates[0];
  const bestKnownAlternativeReturn = clamp01(
    Math.max(
      bestWater === undefined ? 0 : bestWater.reliability - bestWater.travelCostFromCurrent * 0.22 - bestWater.socialAccessRisk * 0.14,
      riverProspect === undefined
        ? 0
        : riverProspect.expectedWater * 0.32 +
          riverProspect.expectedFood * 0.3 +
          riverProspect.prospectStrength * 0.24 -
          riverProspect.travelCost * 0.16,
    ),
  );
  const currentRefugeSecurity = clamp01(
    currentWaterRefuge.drySeasonReliability * 0.42 +
      currentWaterRefuge.reliability * 0.24 +
      placeAttachment * 0.16 +
      (currentRecord?.confidence ?? 0.4) * 0.16 -
      currentWaterRefuge.droughtFailureRisk * 0.14,
  );
  const lossOfFallbackSecurity = clamp01(currentRefugeSecurity * 0.46 + seasonalMode.dryRefugePull * 0.22);
  const socialAccessRisk = riverProspect?.socialAccessRisk ?? currentWaterRefuge.socialAccessRisk;
  const uncertaintyPenalty = riverProspect === undefined ? 0.1 : riverProspect.uncertainty;
  const expectedNextReturn = clamp01(currentMarginalReturn - localUsePressure * 0.18 - seasonalMode.droughtSeverity * 0.12);
  const stayValue = clamp01(
    currentRefugeSecurity * 0.44 +
      currentMarginalReturn * 0.34 +
      placeAttachment * 0.12 -
      seasonalMode.droughtSeverity * 0.1 -
      localUsePressure * 0.16,
  );
  const moveValue = clamp01(
    bestKnownAlternativeReturn * 0.58 +
      (riverProspect?.prospectStrength ?? 0) * 0.2 -
      lossOfFallbackSecurity * 0.22 -
      uncertaintyPenalty * 0.2 -
      socialAccessRisk * 0.16 -
      (riverProspect?.crossingRisk ?? 0) * 0.18,
  );
  const scoutValue = clamp01(
    (riverProspect?.prospectStrength ?? 0) * 0.44 +
      uncertaintyPenalty * 0.22 +
      Math.max(0, 0.52 - expectedNextReturn) * 0.2 +
      seasonalMode.temporaryWaterOpportunity * 0.14 +
      seasonalMode.waterContraction * 0.12 -
      (band.pressureState?.riskPressure ?? 0) * 0.1 -
      getLowAdultProbePenalty(band),
  );
  const departureThreshold = clamp01(
    0.16 +
      lossOfFallbackSecurity * 0.16 +
      uncertaintyPenalty * 0.12 +
      socialAccessRisk * 0.08 -
      seasonalMode.waterContraction * 0.08,
  );

  return {
    bandId: band.id,
    currentTileId: band.position,
    stayValue: round2(stayValue),
    moveValue: round2(moveValue),
    scoutValue: round2(scoutValue),
    currentRefugeSecurity: round2(currentRefugeSecurity),
    lossOfFallbackSecurity: round2(lossOfFallbackSecurity),
    currentMarginalReturn: round2(currentMarginalReturn),
    expectedNextReturn: round2(expectedNextReturn),
    bestKnownAlternativeReturn: round2(bestKnownAlternativeReturn),
    departureThreshold: round2(departureThreshold),
    uncertaintyPenalty: round2(uncertaintyPenalty),
    socialAccessRisk: round2(socialAccessRisk),
    reasonIds: [makeDryMarginReasonId(world.time, band, "stay-move-scout")],
  };
}

function isLogisticalProbeAvailable(
  band: Band,
  seasonalMode: SeasonalMobilityModeState,
  riverProspect: RiverCorridorProspect | undefined,
  comparison: StayMoveScoutComparison,
  beliefProbePressure = 0,
): boolean {
  const workingAdultShare = band.demography.workingAdults / Math.max(1, band.demography.population);
  // Resource-belief curiosity (2K.1F) lowers the scout-desire bar by a small bounded
  // amount, so a band that believes resources exist elsewhere is marginally more
  // willing to scout. Capped well below the band width so the effect is "slightly
  // more probes", not a blanket flip. It never relaxes the water prospect's own
  // existence/strength gate, the working-adult floor, the risk ceiling, or the
  // drought-emergency exclusion — so this widens probing, not relocation or water logic.
  const scoutValueThreshold = 0.28 - Math.min(BELIEF_PROBE_THRESHOLD_RELAXATION_CAP, clamp01(beliefProbePressure) * 0.4);

  return (
    riverProspect?.bestProspectTileId !== undefined &&
    riverProspect.prospectStrength > 0.22 &&
    comparison.scoutValue > scoutValueThreshold &&
    workingAdultShare > 0.42 &&
    (band.pressureState?.riskPressure ?? 0) < 0.76 &&
    seasonalMode.mode !== "drought_emergency"
  );
}

function getCurrentPlaceAssessment(
  band: Band,
  currentWaterRefuge: WaterRefugeProfile,
  seasonalMode: SeasonalMobilityModeState,
  comparison: StayMoveScoutComparison,
): DryMarginMobilityContext["currentPlaceAssessment"] {
  const localPressure = band.usePressure[currentWaterRefuge.tileId];
  const usePressure = localPressure === undefined
    ? 0
    : Math.max(localPressure.foragingPressure, localPressure.waterPressure, localPressure.aquaticPressure);

  if (comparison.currentMarginalReturn < 0.34 && (usePressure > 0.42 || seasonalMode.droughtSeverity > 0.54)) {
    return "declining_refuge";
  }

  if (currentWaterRefuge.drySeasonReliability > 0.5 && comparison.currentRefugeSecurity > 0.48) {
    return "known_refuge";
  }

  if (seasonalMode.mode === "wet_season_dispersal" || seasonalMode.mode === "green_season_harvest") {
    return "seasonal_opportunity";
  }

  if (comparison.stayValue > comparison.moveValue && comparison.currentRefugeSecurity > 0.34) {
    return "poor_but_safe_fallback";
  }

  if (usePressure > 0.5 || currentWaterRefuge.droughtFailureRisk > 0.62) {
    return "risky_depleted_holdover";
  }

  return "unknown";
}

function getSalientCandidateTileIds(
  world: WorldState,
  band: Band,
  contextCache?: TickContextCache,
): readonly TileId[] {
  const salient = getSalientMemorySummary(contextCache, band.id);
  const currentTile = getTile(world, band.position);
  const candidateIds = new Set<TileId>();

  for (const tileId of salient?.knownOpportunityCandidateIds ?? []) {
    candidateIds.add(tileId);
  }

  for (const tileId of salient?.knownFrontierTileIds ?? []) {
    candidateIds.add(tileId);
  }

  for (const tileId of salient?.topReturnPlaceIds ?? []) {
    candidateIds.add(tileId);
  }

  for (const tileId of salient?.topAnchorPlaceIds ?? []) {
    candidateIds.add(tileId);
  }

  if (currentTile !== undefined) {
    for (const neighbor of getNeighborTiles(world, currentTile.id)) {
      if (band.knowledge.observedTiles[neighbor.id] !== undefined) {
        candidateIds.add(neighbor.id);
      }
    }
  }

  return [...candidateIds]
    .filter((tileId) => band.knowledge.observedTiles[tileId] !== undefined)
    .sort((left, right) => String(left).localeCompare(String(right)))
    .slice(0, 32);
}

function getProspectBasis(
  tile: Tile,
  record: KnownTileRecord,
  hasCrossing: boolean,
): readonly RiverCorridorProspectBasis[] {
  const basis: RiverCorridorProspectBasis[] = [];

  if (tile.isRiver || tile.isRiverbank || tile.terrainKind === "river_valley") {
    basis.push("known_river_continuity");
  }

  if (tile.isFloodplain) {
    basis.push("known_floodplain_edge");
  }

  if (hasCrossing) {
    basis.push("known_ford_or_crossing");
  }

  if ((record.observedWaterAccess ?? 0) > 0.48) {
    basis.push("known_water_reliability");
  }

  if (record.visits > 0 || record.confidence > 0.62) {
    basis.push("known_place_memory");
  }

  if ((tile.terrainKind === "desert" || tile.biomeKind === "arid" || tile.terrainKind === "hills") && (record.observedWaterAccess ?? 0) > 0.28) {
    basis.push("wadi_or_dry_channel_continuity");
  }

  return basis.length === 0 ? ["known_place_memory"] : basis;
}

function getCorridorStrength(
  currentTile: Tile,
  targetTile: Tile,
  basis: readonly RiverCorridorProspectBasis[],
): number {
  return clamp01(
    (basis.includes("known_river_continuity") ? 0.34 : 0) +
      (basis.includes("known_floodplain_edge") ? 0.2 : 0) +
      (basis.includes("known_ford_or_crossing") ? 0.14 : 0) +
      (basis.includes("wadi_or_dry_channel_continuity") ? 0.22 : 0) +
      (currentTile.riverSegmentId !== undefined && currentTile.riverSegmentId === targetTile.riverSegmentId ? 0.18 : 0),
  );
}

function getProspectDirection(
  currentTile: Tile,
  targetTile: Tile,
  basis: readonly RiverCorridorProspectBasis[],
): RiverProspectDirection {
  if (basis.includes("wadi_or_dry_channel_continuity")) {
    return "wadi_chain";
  }

  if (basis.includes("known_floodplain_edge")) {
    return "floodplain_edge";
  }

  if (targetTile.coord.y > currentTile.coord.y) {
    return "downstream";
  }

  if (targetTile.coord.y < currentTile.coord.y) {
    return "upstream";
  }

  return basis.includes("known_river_continuity") ? "riverbank" : "unknown";
}

function getSocialAccessRisk(
  world: WorldState,
  band: Band,
  tileId: TileId,
  contextCache?: TickContextCache,
): number {
  const knownContactCount = Object.keys(band.contactMemories).length + band.knowledge.knownBands.length;
  const nearbyBandCount = contextCache?.nearbyBandsByBandId.get(band.id)?.length ?? 0;
  const salientUsers = contextCache?.salientMemoryBandIdsByTileId.get(tileId)?.filter((bandId) => bandId !== band.id).length ?? 0;
  const localCrowding = clamp01(nearbyBandCount / 5 + salientUsers / 4);
  const knownContactRelief = clamp01(knownContactCount * 0.08);
  const unrelatedRisk = Object.values(world.bands).length > 8 && knownContactCount === 0 ? 0.08 : 0;

  return clamp01(0.28 + localCrowding * 0.26 + unrelatedRisk - knownContactRelief);
}

function getFallbackRank(
  sourceKind: WaterSourceKind,
  drySeasonReliability: number,
  distance: number,
  socialAccessRisk: number,
): number {
  const kindRank: Record<WaterSourceKind, number> = {
    permanent_refuge_water: 1,
    spring_or_seep: 2,
    river_channel: 3,
    lake_margin: 4,
    marsh_edge: 5,
    floodplain_moisture: 6,
    known_ford_water: 7,
    seasonal_pool: 8,
    wadi_or_dry_channel: 9,
    ephemeral_rain_pool: 10,
    failed_or_unreliable_water: 11,
    unknown: 12,
  };

  return Math.max(1, Math.round(kindRank[sourceKind] + distance * 0.2 + socialAccessRisk * 1.8 - drySeasonReliability * 1.4));
}

function compareWaterRefugeProfiles(left: WaterRefugeProfile, right: WaterRefugeProfile): number {
  const scoreDelta =
    right.reliability + right.drySeasonReliability * 0.7 - right.travelCostFromCurrent * 0.24 - right.socialAccessRisk * 0.18 -
    (left.reliability + left.drySeasonReliability * 0.7 - left.travelCostFromCurrent * 0.24 - left.socialAccessRisk * 0.18);

  return scoreDelta === 0 ? String(left.tileId).localeCompare(String(right.tileId)) : scoreDelta;
}

function compareProspectCandidates(left: ProspectCandidate, right: ProspectCandidate): number {
  const leftScore = getProspectCandidateScore(left);
  const rightScore = getProspectCandidateScore(right);

  return leftScore === rightScore ? String(left.tileId).localeCompare(String(right.tileId)) : rightScore - leftScore;
}

function getProspectCandidateScore(candidate: ProspectCandidate): number {
  return (
    candidate.expectedWater * 0.34 +
    candidate.expectedFood * 0.26 +
    candidate.corridorStrength * 0.22 +
    candidate.confidence * 0.12 -
    candidate.travelCost * 0.18 -
    candidate.uncertainty * 0.14 -
    candidate.crossingRisk * 0.2 -
    candidate.socialAccessRisk * 0.12
  );
}

function getGridDistance(first: Tile, second: Tile): number {
  return Math.abs(first.coord.x - second.coord.x) + Math.abs(first.coord.y - second.coord.y);
}

function getLowAdultProbePenalty(band: Band): number {
  const workingAdultShare = band.demography.workingAdults / Math.max(1, band.demography.population);

  return clamp01(Math.max(0, 0.44 - workingAdultShare) * 0.7);
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function makeDryMarginReasonId(time: WorldTime, band: Band, suffix: string): ReasonId {
  return `reason:${band.id}:${time.tick}:dry-margin:${suffix}` as ReasonId;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
