import type {
  Band,
  BiomeAdaptationProfile,
  BiomeCompetenceRecord,
} from "./types";
import type { TileId, WorldTime } from "../core/types";
import type { BiomeKind, Tile, WorldState } from "../world/types";

export interface BiomeAdaptationFit {
  readonly biomeKind: BiomeKind;
  readonly familiarity: number;
  readonly competence: number;
  readonly mismatchPenalty: number;
  readonly confidence: number;
}

export function createInitialBiomeAdaptation(
  tile: Tile,
  time: WorldTime,
): BiomeAdaptationProfile {
  const biomeKind = getTileBiomeKind(tile);
  const record = createBiomeRecord(biomeKind, time, {
    familiarity: 0.56,
    competence: 0.46,
    successfulUseTicks: 1,
    confidence: 0.62,
  });

  return {
    currentBiomeKind: biomeKind,
    records: { [biomeKind]: record },
    mismatchStress: 0,
  };
}

export function inheritBiomeAdaptation(
  parent: BiomeAdaptationProfile,
  targetTile: Tile,
  time: WorldTime,
): BiomeAdaptationProfile {
  const targetBiomeKind = getTileBiomeKind(targetTile);
  const records: Partial<Record<BiomeKind, BiomeCompetenceRecord>> = {};

  for (const record of Object.values(parent.records)) {
    if (record === undefined) {
      continue;
    }

    records[record.biomeKind] = {
      ...record,
      familiarity: round2(clamp01(record.familiarity * 0.76)),
      competence: round2(clamp01(record.competence * 0.72)),
      confidence: round2(clamp01(record.confidence * 0.84)),
      lastUpdatedAt: time,
    };
  }

  const targetRecord = records[targetBiomeKind];
  records[targetBiomeKind] = createBiomeRecord(targetBiomeKind, time, {
    familiarity: Math.max(targetRecord?.familiarity ?? 0, 0.34),
    competence: Math.max(targetRecord?.competence ?? 0, 0.28),
    successfulUseTicks: targetRecord?.successfulUseTicks ?? 0,
    confidence: Math.max(targetRecord?.confidence ?? 0, 0.42),
  });

  return {
    currentBiomeKind: targetBiomeKind,
    records,
    mismatchStress: getBiomeAdaptationFit({ currentBiomeKind: targetBiomeKind, records, mismatchStress: 0 }, targetTile)
      .mismatchPenalty,
  };
}

export function updateBiomeAdaptation(input: {
  readonly world: WorldState;
  readonly band: Band;
  readonly observedTileIds: readonly TileId[];
  readonly nextPosition: TileId;
  readonly moved: boolean;
}): BiomeAdaptationProfile {
  const records: Partial<Record<BiomeKind, BiomeCompetenceRecord>> = {
    ...input.band.biomeAdaptation.records,
  };
  const tileIds = addUnique(input.observedTileIds, input.nextPosition);

  for (const tileId of tileIds) {
    const tile = input.world.tiles[tileId];

    if (tile === undefined) {
      continue;
    }

    const biomeKind = getTileBiomeKind(tile);
    const existing = records[biomeKind];
    const isCurrentTile = tile.id === input.nextPosition;
    const useGain = isCurrentTile
      ? (input.moved ? 0.018 : 0.026)
      : 0.006;
    const successValue = getObservedBiomeUseValue(input.band, tile, isCurrentTile);
    const competenceGain = successValue * useGain;

    records[biomeKind] = {
      biomeKind,
      familiarity: round2(clamp01((existing?.familiarity ?? 0.18) + useGain * 1.35)),
      competence: round2(clamp01((existing?.competence ?? 0.14) + competenceGain)),
      successfulUseTicks: (existing?.successfulUseTicks ?? 0) + (isCurrentTile && successValue > 0.52 ? 1 : 0),
      lastUpdatedAt: input.world.time,
      confidence: round2(clamp01((existing?.confidence ?? 0.24) + (isCurrentTile ? 0.018 : 0.006))),
    };
  }

  const currentTile = input.world.tiles[input.nextPosition];
  const currentBiomeKind = currentTile === undefined ? input.band.biomeAdaptation.currentBiomeKind : getTileBiomeKind(currentTile);
  const mismatchStress = currentTile === undefined
    ? input.band.biomeAdaptation.mismatchStress
    : getBiomeAdaptationFit({ currentBiomeKind, records, mismatchStress: 0 }, currentTile).mismatchPenalty;

  return {
    currentBiomeKind,
    records,
    mismatchStress: round2(mismatchStress),
  };
}

export function getBiomeAdaptationFit(
  profile: BiomeAdaptationProfile,
  tile: Tile,
): BiomeAdaptationFit {
  const biomeKind = getTileBiomeKind(tile);
  const record = profile.records[biomeKind];
  const familiarity = record?.familiarity ?? 0.12;
  const competence = record?.competence ?? 0.1;
  const confidence = record?.confidence ?? 0.18;
  const terrainHarshness = getBiomeHarshness(tile);
  const mismatchPenalty = clamp01(
    terrainHarshness * (1 - competence * 0.74 - familiarity * 0.2),
  );

  return {
    biomeKind,
    familiarity: round2(familiarity),
    competence: round2(competence),
    mismatchPenalty: round2(mismatchPenalty),
    confidence: round2(confidence),
  };
}

function createBiomeRecord(
  biomeKind: BiomeKind,
  time: WorldTime,
  values: {
    readonly familiarity: number;
    readonly competence: number;
    readonly successfulUseTicks: number;
    readonly confidence: number;
  },
): BiomeCompetenceRecord {
  return {
    biomeKind,
    familiarity: round2(clamp01(values.familiarity)),
    competence: round2(clamp01(values.competence)),
    successfulUseTicks: values.successfulUseTicks,
    lastUpdatedAt: time,
    confidence: round2(clamp01(values.confidence)),
  };
}

function getTileBiomeKind(tile: Tile): BiomeKind {
  return tile.biomeKind ?? "unknown";
}

function getObservedBiomeUseValue(band: Band, tile: Tile, isCurrentTile: boolean): number {
  // Familiarity can grow from an observation, but competence represents lived
  // success.  Do not let static habitat richness award adaptation progress when
  // physical activities are failing or the observed tile was never occupied.
  if (!isCurrentTile || band.knowledge.observedTiles[tile.id] === undefined) {
    return 0;
  }

  const physicalSupport = clamp01(
    band.carryingCapacity?.perCapitaReturn.supportDebug.humanFoodLedger?.rawSupportRatio ??
      band.seasonalSupport?.currentSeasonSupport.clampedSupportRatio ??
      0,
  );
  const waterSecurity = clamp01(1 - (band.pressureState?.waterStress ?? 0.5));
  const riskSecurity = clamp01(1 - (band.pressureState?.riskPressure ?? 0.5));

  return clamp01(physicalSupport * 0.62 + waterSecurity * 0.22 + riskSecurity * 0.16);
}

function getBiomeHarshness(tile: Tile): number {
  return clamp01(
    0.22 +
      tile.riskProfile.droughtRisk * 0.28 +
      tile.riskProfile.floodRisk * 0.18 +
      tile.riskProfile.diseaseRisk * 0.12 +
      Math.max(0, tile.movementCost - 1.1) * 0.14 +
      (tile.terrainKind === "desert" ? 0.22 : 0) +
      (tile.terrainKind === "mountains" ? 0.2 : 0) +
      (tile.terrainKind === "wetlands" ? 0.12 : 0),
  );
}

function addUnique(values: readonly TileId[], extra: TileId): readonly TileId[] {
  return [...new Set([...values, extra])];
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
