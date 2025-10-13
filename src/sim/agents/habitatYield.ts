import type {
  BaseHabitatPotential,
  SeasonalEffectiveYield,
} from "./types";
import type { ReasonId, Season, TickNumber, TileId, WorldTime } from "../core/types";
import type { KnownTileRecord } from "../knowledge/types";

// Carrying-capacity yield layer (checkpoint 2J). Distinguishes stable ecological
// POTENTIAL from current usable EFFECTIVE YIELD. Both are derived from the band's
// OWN observed/remembered tile record (never hidden tile truth), so they are
// anti-omniscient by construction and cheap (no world scan).

export interface EffectiveYieldInput {
  readonly localUsePressure: number;
  readonly crowding: number;
  readonly biomeCompetence: number;
  readonly consecutiveUse: number;
  readonly recoveryProgress: number;
}

// Base habitat potential is a pure function of (tileId, record, time.tick): it
// reads only the band's own immutable known record and embeds the tick in its
// reason id. Yet deriveCarryingCapacity calls it once for the current tile, once
// per catchment tile, and once for the opportunity tile — and the whole derivation
// runs three times per tick (before/after/final context passes). 2J.2C memoizes it
// by the record SNAPSHOT (object identity) validated against the tick + tileId, so
// each distinct record is derived once per tick instead of ~3x+ per tick. Keyed by
// the immutable record object: a band that re-observes a tile produces a NEW record
// object (fresh key, recomputed); an unchanged record reuses one result. Byte-
// identical, and it caps the per-tile yield derivation that Resource Class
// Framework (2K) would otherwise multiply across resource classes. The cached
// object is treated as read-only by all callers.
const baseHabitatPotentialMemo = new WeakMap<
  KnownTileRecord,
  { readonly tick: TickNumber; readonly tileId: TileId; readonly value: BaseHabitatPotential }
>();

// Stable ecological potential of a tile, from the band's known record. Barely
// changes season to season — it is the ceiling, not the current return.
export function deriveBaseHabitatPotential(
  tileId: TileId,
  record: KnownTileRecord,
  time: WorldTime,
): BaseHabitatPotential {
  const cached = baseHabitatPotentialMemo.get(record);

  if (cached !== undefined && cached.tick === time.tick && cached.tileId === tileId) {
    return cached.value;
  }

  const value = computeBaseHabitatPotential(tileId, record, time);
  baseHabitatPotentialMemo.set(record, { tick: time.tick, tileId, value });

  return value;
}

function computeBaseHabitatPotential(
  tileId: TileId,
  record: KnownTileRecord,
  time: WorldTime,
): BaseHabitatPotential {
  const foraging = clamp01(record.observedRichness);
  const aquatic = clamp01(record.observedAquaticPotential);
  const water = clamp01(record.observedWaterAccess ?? 0.35);
  // Plant + recovery are deeper ecological traits the band approximates from what
  // it has observed (richness, storage suitability, seasonal reliability).
  const plant = clamp01(record.observedRichness * 0.6 + (record.observedStorageSuitability ?? 0.2) * 0.2);
  const reliability = record.observedSeasonalPattern?.reliability ?? 0.46;
  const present = [foraging > 0.3, aquatic > 0.3, water > 0.4, plant > 0.3].filter(Boolean).length;
  const resourceDiversity = clamp01(present / 4);
  const recoveryPotential = clamp01(reliability * 0.7 + resourceDiversity * 0.3);
  const seasonalVariance = clamp01(1 - reliability);

  return {
    tileId,
    foragingPotential: round2(foraging),
    aquaticPotential: round2(aquatic),
    plantPotential: round2(plant),
    animalPotentialPlaceholder: 0,
    waterPotential: round2(water),
    resourceDiversity: round2(resourceDiversity),
    recoveryPotential: round2(recoveryPotential),
    seasonalVariance: round2(seasonalVariance),
    reasonIds: [makeYieldReasonId(time, tileId, "base_habitat_potential_derived")],
  };
}

// Current usable return: base potential modulated by season, biome competence,
// water reliability and resource diversity, then reduced by local use, crowding,
// and sustained-use depletion, with a recovery bonus when the tile has rested.
export function deriveSeasonalEffectiveYield(
  base: BaseHabitatPotential,
  record: KnownTileRecord,
  time: WorldTime,
  input: EffectiveYieldInput,
): SeasonalEffectiveYield {
  const basePotential = clamp01(
    base.foragingPotential * 0.5 +
      base.aquaticPotential * 0.22 +
      base.plantPotential * 0.16 +
      base.waterPotential * 0.12,
  );
  const seasonModifier = getSeasonResourceModifier(record, time.season);
  const competenceModifier = 0.7 + clamp01(input.biomeCompetence) * 0.3;
  const waterReliabilityModifier = 0.75 + clamp01(base.waterPotential) * 0.25;
  const diversityBuffer = clamp01(base.resourceDiversity);
  const localUsePenalty = clamp01(input.localUsePressure);
  const crowdingPenalty = clamp01(input.crowding);
  // Sustained repeated use degrades faster than fresh use; recovery offsets it.
  const depletionPenalty = clamp01(
    Math.min(1, input.consecutiveUse / 6) * 0.5 + localUsePenalty * 0.34 - input.recoveryProgress * 0.34,
  );
  const recoveryBonus = clamp01(base.recoveryPotential * (1 - localUsePenalty) * (0.4 + input.recoveryProgress * 0.6));

  const effectiveYield = clamp01(
    basePotential *
      seasonModifier *
      competenceModifier *
      waterReliabilityModifier *
      (0.85 + diversityBuffer * 0.15) +
      recoveryBonus * 0.12 -
      localUsePenalty * 0.24 -
      crowdingPenalty * 0.25 -
      depletionPenalty * 0.16,
  );
  const foodYield = clamp01(base.foragingPotential * seasonModifier * competenceModifier - localUsePenalty * 0.24);
  const aquaticYield = clamp01(base.aquaticPotential * seasonModifier - localUsePenalty * 0.16);
  const plantYield = clamp01(base.plantPotential * seasonModifier - localUsePenalty * 0.2);
  const confidence = clamp01(record.confidence * 0.8 + 0.12);

  const reasonIds: ReasonId[] = [makeYieldReasonId(time, base.tileId, "seasonal_effective_yield_updated")];

  if (localUsePenalty > 0.3 || depletionPenalty > 0.3) {
    reasonIds.push(makeYieldReasonId(time, base.tileId, "local_use_reduced_effective_yield"));
  }

  if (recoveryBonus > 0.2 && localUsePenalty < 0.2) {
    reasonIds.push(makeYieldReasonId(time, base.tileId, "recovery_restored_effective_yield"));
  }

  return {
    tileId: base.tileId,
    season: time.season,
    basePotential: round2(basePotential),
    effectiveYield: round2(effectiveYield),
    foodYield: round2(foodYield),
    aquaticYield: round2(aquaticYield),
    plantYield: round2(plantYield),
    waterSupport: round2(base.waterPotential),
    diversityBuffer: round2(diversityBuffer),
    recoveryBonus: round2(recoveryBonus),
    localUsePenalty: round2(localUsePenalty),
    crowdingPenalty: round2(crowdingPenalty),
    depletionPenalty: round2(depletionPenalty),
    confidence: round2(confidence),
    reasonIds,
  };
}

function getSeasonResourceModifier(record: KnownTileRecord, season: Season): number {
  const pattern = record.observedSeasonalPattern;

  if (pattern === undefined) {
    return 0.85;
  }

  if (pattern.peakSeasons?.includes(season)) {
    return clamp(0.95 + pattern.reliability * 0.3, 0.7, 1.3);
  }

  if (pattern.leanSeasons?.includes(season)) {
    return clamp(0.55 + pattern.reliability * 0.2, 0.4, 0.95);
  }

  return clamp(0.75 + pattern.reliability * 0.2, 0.6, 1.05);
}

function makeYieldReasonId(time: WorldTime, tileId: TileId, suffix: string): ReasonId {
  return `reason:yield:${tileId}:${time.tick}:${suffix}` as ReasonId;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
