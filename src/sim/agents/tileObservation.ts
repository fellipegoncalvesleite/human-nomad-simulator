// EXPEDITIONARY-4 §11 — the canonical known-tile observation writer, extracted from the
// decision orchestrator so DOMAIN systems can apply physically-earned observation
// through the same single pipeline. Two producers exist:
//   - the residential decision path (movement/probe observation, unchanged semantics);
//   - a returned expedition party applying the tiles it PHYSICALLY walked (knowledge
//     latency: those observations become band knowledge only at return).
// Behaviour is byte-identical to the pre-extraction bandDecision implementation.
import type { BandId, TileId } from "../core/types";
import type { KnownTileRecord, KnowledgeState, TileObservation } from "../knowledge/types";
import { getDepletionAdjustedRichness } from "../world/depletion";
import type { Tile, WorldState } from "../world/types";

export const RECENT_TILE_OBSERVATION_HISTORY_LIMIT = 180;

export interface ObservationTarget {
  readonly tile: Tile;
  readonly distance: number;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** Band-perceived tile risk: a bounded blend of the tile's own risk profile. */
export function getObservedRisk(tile: Tile): number {
  return clamp01(
    tile.riskProfile.floodRisk * 0.34 +
      tile.riskProfile.droughtRisk * 0.34 +
      tile.riskProfile.diseaseRisk * 0.32,
  );
}

/**
 * Apply a bounded set of physical observation targets to a band's knowledge state.
 * Confidence falls with observation distance; a visited tile (distance 0) counts a
 * visit. This is band-perception, not hidden truth: everything recorded is what a
 * person standing there (or nearby) can see.
 */
export function observeTileAndNearby(
  world: WorldState,
  knowledge: KnowledgeState,
  targets: readonly ObservationTarget[],
): KnowledgeState {
  const observedTiles: Record<string, KnownTileRecord> = {
    ...knowledge.observedTiles,
  };
  const tileObservationHistory: TileObservation[] = [
    ...knowledge.tileObservationHistory.slice(-RECENT_TILE_OBSERVATION_HISTORY_LIMIT),
  ];

  for (const target of targets) {
    observeTile(world, observedTiles, tileObservationHistory, knowledge.selfBandId, target);
  }

  return {
    ...knowledge,
    observedTiles: observedTiles as Readonly<Record<TileId, KnownTileRecord>>,
    tileObservationHistory: tileObservationHistory.slice(-RECENT_TILE_OBSERVATION_HISTORY_LIMIT),
  };
}

function observeTile(
  world: WorldState,
  observedTiles: Record<string, KnownTileRecord>,
  tileObservationHistory: TileObservation[],
  observerBandId: BandId,
  target: ObservationTarget,
): void {
  const existingRecord = observedTiles[target.tile.id];
  const confidence = target.distance === 0 ? 1 : target.distance === 1 ? 0.68 : 0.34;
  const existingSeasons = existingRecord?.seasonsObserved ?? [];
  const seasonsObserved = existingSeasons.includes(world.time.season)
    ? existingSeasons
    : [...existingSeasons, world.time.season];
  const visits = (existingRecord?.visits ?? 0) + (target.distance === 0 ? 1 : 0);
  const observedRisk = getObservedRisk(target.tile);
  const record: KnownTileRecord = {
    tileId: target.tile.id,
    firstObservedAt: existingRecord?.firstObservedAt ?? world.time,
    lastObservedAt: world.time,
    seasonsObserved,
    visits,
    observedRichness: getDepletionAdjustedRichness(world, target.tile),
    observedWaterAccess: target.tile.resourceProfile.waterAccess,
    observedAquaticPotential: target.tile.resourceProfile.aquaticPotential,
    observedMovementCost: target.tile.movementCost,
    observedRisk,
    observedStorageSuitability: target.tile.resourceProfile.storageSuitability,
    observedSeasonalPattern: {
      peakSeasons: target.tile.seasonalProfile.peakSeasons,
      leanSeasons: target.tile.seasonalProfile.leanSeasons,
      reliability: target.tile.seasonalProfile.reliability,
      confidence: Math.max(existingRecord?.observedSeasonalPattern?.confidence ?? 0, confidence),
    },
    confidence: Math.max(existingRecord?.confidence ?? 0, confidence),
    knowledgeSource: "personally_observed",
  };

  tileObservationHistory.push({
    tileId: target.tile.id,
    observedAt: world.time,
    season: world.time.season,
    observedRichness: getDepletionAdjustedRichness(world, target.tile),
    observedAquaticPotential: target.tile.resourceProfile.aquaticPotential,
    observedRisk,
    observerBandId,
  });

  observedTiles[target.tile.id] = record;
}
