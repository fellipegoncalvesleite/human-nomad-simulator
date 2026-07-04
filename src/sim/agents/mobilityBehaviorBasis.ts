import { getDryMarginRelevanceBasis } from "./dryMargin";
import type {
  Band,
  MobilityBehaviorBasis,
  MobilityBehaviorBasisKind,
} from "./types";
import type { ReasonId, WorldTime } from "../core/types";
import { getTile } from "../world/generate";
import type { Tile, WorldState } from "../world/types";

// Ecology/experience-driven mobility character (checkpoint 2I.6). Derives a
// band's river/coast/wetland/dry/highland/frontier/return affinities from where
// it actually lives (current tile + known neighbours) and what it has learned
// (corridor/crossing/anchor/seasonal-round memory + pressure), with the starting
// spawn profile only a weak prior that decays as lived experience accumulates.
// Pure, bounded (current tile + neighbours + bounded memories), anti-omniscient.

interface EcologyAffinity {
  readonly river: number;
  readonly coast: number;
  readonly wetlandLake: number;
  readonly dry: number;
  readonly highland: number;
}

// Profile prior strength when the band has no experience; scaled by the (decaying)
// starting-profile weight so it fades as the band learns.
const PROFILE_PRIOR_STRENGTH = 0.4;

export function deriveMobilityBehaviorBasis(
  world: WorldState,
  band: Band,
): MobilityBehaviorBasis | undefined {
  const currentTile = getTile(world, band.position);

  if (currentTile === undefined) {
    return undefined;
  }

  const knownTileCount = Object.keys(band.knowledge.observedTiles).length;
  const corridorCount = Object.keys(band.travelCorridors).length;
  const crossingCount = Object.keys(band.crossingMemories).length;
  const anchorMemoryCount = band.anchorMemories === undefined ? 0 : Object.keys(band.anchorMemories).length;
  const roundConfidence = band.seasonalRound?.confidence ?? 0;
  const biomeConfidence = getCurrentBiomeConfidence(band, currentTile);

  // Experience vs starting profile: profile is a weak prior, strongest at birth.
  const learnedExperienceWeight = clamp01(
    Math.min(1, knownTileCount / 40) * 0.4 +
      Math.min(1, corridorCount / 4) * 0.15 +
      Math.min(1, anchorMemoryCount / 3) * 0.15 +
      roundConfidence * 0.15 +
      biomeConfidence * 0.15,
  );
  const profileRole = band.initialSpawnReason?.profileRole;
  const startingProfileWeight = profileRole === undefined
    ? 0
    : round2(clamp01(1 - learnedExperienceWeight));
  const startingProfileOverridden = profileRole !== undefined && learnedExperienceWeight > startingProfileWeight;

  const basisKinds = new Set<MobilityBehaviorBasisKind>();

  // --- Current ecology (current tile + known neighbours), bounded ---
  const ecology: { river: number; coast: number; wetlandLake: number; dry: number; highland: number; weight: number } = {
    river: 0,
    coast: 0,
    wetlandLake: 0,
    dry: 0,
    highland: 0,
    weight: 0,
  };
  accumulateTileEcology(ecology, getTileEcologyAffinity(currentTile), 1);

  for (const neighborId of currentTile.neighbors) {
    const record = band.knowledge.observedTiles[neighborId];
    const neighbor = getTile(world, neighborId);

    if (record === undefined || neighbor === undefined) {
      continue;
    }

    accumulateTileEcology(ecology, getTileEcologyAffinity(neighbor), 0.5 * record.confidence);
  }

  const ecologyWeight = Math.max(1, ecology.weight);
  let riverAffinity = ecology.river / ecologyWeight;
  let coastAffinity = ecology.coast / ecologyWeight;
  let wetlandLakeAffinity = ecology.wetlandLake / ecologyWeight;
  let dryMarginAffinity = ecology.dry / ecologyWeight;
  let highlandPassAffinity = ecology.highland / ecologyWeight;

  if (riverAffinity > 0.12 || coastAffinity > 0.12 || wetlandLakeAffinity > 0.12 || dryMarginAffinity > 0.12 || highlandPassAffinity > 0.12) {
    basisKinds.add("current_ecology");
  }

  // --- Learned memory: corridors (river/coast), crossings (pass), anchors/round (return) ---
  const corridorAffinity = deriveCorridorAffinity(world, band);
  if (corridorAffinity.river > 0) {
    riverAffinity = clamp01(riverAffinity + corridorAffinity.river);
    basisKinds.add("hydrography");
    basisKinds.add("learned_memory");
  }
  if (corridorAffinity.coast > 0) {
    coastAffinity = clamp01(coastAffinity + corridorAffinity.coast);
    basisKinds.add("coastline");
    basisKinds.add("learned_memory");
  }
  if (corridorAffinity.wetlandLake > 0) {
    wetlandLakeAffinity = clamp01(wetlandLakeAffinity + corridorAffinity.wetlandLake);
    basisKinds.add("lake_wetland");
    basisKinds.add("learned_memory");
  }

  if (crossingCount > 0) {
    highlandPassAffinity = clamp01(highlandPassAffinity + Math.min(1, crossingCount / 3) * 0.3);
    basisKinds.add("pass_highland");
    basisKinds.add("learned_memory");
  }

  // --- Return/refuge affinity from anchor + seasonal round + water refuge memory ---
  const anchorWaterSecurity = band.residentialAnchor?.anchorWaterSecurity ?? 0;
  const hasTetheringWater = band.residentialAnchor?.tetheringWaterTileId !== undefined;
  let returnRefugeAffinity = clamp01(
    roundConfidence * 0.5 +
      anchorWaterSecurity * 0.3 +
      Math.min(1, anchorMemoryCount / 3) * 0.2,
  );
  if (band.residentialAnchor !== undefined) {
    basisKinds.add("residential_anchor");
  }
  if (band.seasonalRound !== undefined && roundConfidence > 0.2) {
    basisKinds.add("seasonal_round");
  }
  if (hasTetheringWater) {
    basisKinds.add("water_refuge");
  }
  if (biomeConfidence > 0.3) {
    basisKinds.add("biome_adaptation");
  }

  // --- Dry-margin: fold the ecology/experience relevance basis (reused helper) ---
  const dryMarginRelevance = getDryMarginRelevanceBasis(world, band);
  if (dryMarginRelevance.length > 0) {
    dryMarginAffinity = clamp01(dryMarginAffinity + Math.min(1, dryMarginRelevance.length / 3) * 0.3);
    basisKinds.add("dry_margin_pressure");
  }

  // --- Pressure: water stress, crowding, daughter dispersal ---
  const waterStress = band.pressureState?.waterStress ?? 0;
  const saturation = band.rangeSaturation?.saturationPressure ?? 0;
  const frontierPressure = band.frontierDispersal?.pressure ?? 0;
  const daughterPressure = band.parentBandId === undefined ? 0 : frontierPressure;

  const waterSeekingAffinity = clamp01(waterStress * 0.7 + dryMarginAffinity * 0.3);
  if (waterStress > 0.4) {
    dryMarginAffinity = clamp01(dryMarginAffinity + waterStress * 0.25);
  }

  let frontierAffinity = clamp01(saturation * 0.5 + frontierPressure * 0.4 + daughterPressure * 0.2);
  if (saturation > 0.3 || frontierPressure > 0.3) {
    basisKinds.add("crowding_pressure");
  }
  if (daughterPressure > 0.2) {
    basisKinds.add("daughter_dispersal");
    frontierAffinity = clamp01(frontierAffinity + 0.1);
  }

  const explorationAffinity = clamp01(Math.max(0, 24 - knownTileCount) / 24 * 0.7 + frontierAffinity * 0.2);

  // --- Starting profile: weak prior, scaled by its (decaying) weight ---
  const prior = startingProfileWeight * PROFILE_PRIOR_STRENGTH;
  if (prior > 0.001 && profileRole !== undefined) {
    switch (profileRole) {
      case "river_valley_foragers":
        riverAffinity = clamp01(riverAffinity + prior);
        break;
      case "delta_coastal_foragers":
        coastAffinity = clamp01(coastAffinity + prior);
        break;
      case "lake_wetland_foragers":
        wetlandLakeAffinity = clamp01(wetlandLakeAffinity + prior);
        break;
      case "highland_edge_foragers":
        highlandPassAffinity = clamp01(highlandPassAffinity + prior);
        break;
      case "dry_margin_foragers":
        dryMarginAffinity = clamp01(dryMarginAffinity + prior);
        break;
      default:
        break;
    }
    basisKinds.add("starting_profile");
  }

  const reasonIds: ReasonId[] = [makeBasisReasonId(world.time, band.id, "mobility_behavior_basis_derived")];

  if (startingProfileOverridden && prior < 0.08) {
    reasonIds.push(makeBasisReasonId(world.time, band.id, "learned_experience_overrode_starting_profile"));
  } else if (profileRole !== undefined && startingProfileWeight > learnedExperienceWeight) {
    reasonIds.push(makeBasisReasonId(world.time, band.id, "starting_profile_used_as_weak_prior"));
  } else if (profileRole !== undefined) {
    reasonIds.push(makeBasisReasonId(world.time, band.id, "starting_profile_decayed"));
  }

  if (basisKinds.has("current_ecology")) {
    reasonIds.push(makeBasisReasonId(world.time, band.id, "ecology_basis_selected_intent"));
  }

  if (basisKinds.has("learned_memory")) {
    reasonIds.push(makeBasisReasonId(world.time, band.id, "memory_basis_selected_intent"));
  }

  if (basisKinds.has("dry_margin_pressure") || basisKinds.has("crowding_pressure") || basisKinds.has("daughter_dispersal")) {
    reasonIds.push(makeBasisReasonId(world.time, band.id, "pressure_basis_selected_intent"));
  }

  return {
    bandId: band.id,
    basisKinds: [...basisKinds].sort(),
    riverAffinity: round2(riverAffinity),
    coastAffinity: round2(coastAffinity),
    wetlandLakeAffinity: round2(wetlandLakeAffinity),
    dryMarginAffinity: round2(dryMarginAffinity),
    highlandPassAffinity: round2(highlandPassAffinity),
    frontierAffinity: round2(frontierAffinity),
    returnRefugeAffinity: round2(returnRefugeAffinity),
    waterSeekingAffinity: round2(waterSeekingAffinity),
    explorationAffinity: round2(explorationAffinity),
    confidence: round2(learnedExperienceWeight),
    startingProfileWeight,
    learnedExperienceWeight: round2(learnedExperienceWeight),
    startingProfileOverridden,
    reasonIds,
  };
}

function getTileEcologyAffinity(tile: Tile): EcologyAffinity {
  return {
    river: tile.isRiver || tile.isRiverbank || tile.isFloodplain || tile.terrainKind === "river_valley" ? 1 : 0,
    coast: tile.isCoastal || tile.terrainKind === "coast" ? 1 : 0,
    wetlandLake: tile.terrainKind === "wetlands" || tile.terrainKind === "lake" || tile.isAquatic ? 1 : 0,
    dry: tile.biomeKind === "arid" || tile.terrainKind === "desert" || (tile.riskProfile.droughtRisk ?? 0) > 0.45 ? 1 : 0,
    highland: tile.terrainKind === "hills" || tile.terrainKind === "mountains" || tile.elevation > 0.45 ? 1 : 0,
  };
}

function accumulateTileEcology(
  target: { river: number; coast: number; wetlandLake: number; dry: number; highland: number; weight: number },
  affinity: EcologyAffinity,
  weight: number,
): void {
  target.river += affinity.river * weight;
  target.coast += affinity.coast * weight;
  target.wetlandLake += affinity.wetlandLake * weight;
  target.dry += affinity.dry * weight;
  target.highland += affinity.highland * weight;
  target.weight += weight;
}

function deriveCorridorAffinity(
  world: WorldState,
  band: Band,
): { river: number; coast: number; wetlandLake: number } {
  let river = 0;
  let coast = 0;
  let wetlandLake = 0;

  for (const corridor of Object.values(band.travelCorridors)) {
    const toTile = getTile(world, corridor.toTileId);

    if (toTile === undefined) {
      continue;
    }

    const ecology = getTileEcologyAffinity(toTile);
    const weight = clamp01(corridor.confidence) * 0.18;
    river = Math.max(river, ecology.river * weight);
    coast = Math.max(coast, ecology.coast * weight);
    wetlandLake = Math.max(wetlandLake, ecology.wetlandLake * weight);
  }

  return { river, coast, wetlandLake };
}

function getCurrentBiomeConfidence(band: Band, currentTile: Tile): number {
  const biome = currentTile.biomeKind;

  if (biome === undefined) {
    return 0;
  }

  const record = band.biomeAdaptation.records[biome];

  return record === undefined ? 0 : clamp01(record.confidence);
}

function makeBasisReasonId(time: WorldTime, bandId: string, suffix: string): ReasonId {
  return `reason:${bandId}:${time.tick}:mobility-basis:${suffix}` as ReasonId;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
