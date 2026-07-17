// EXPEDITIONARY-4 §26 — the narrow sanctioned ENVIRONMENTAL travel/perception boundary.
//
// Expedition perception (viewshed, smoke visibility) and fire feasibility need present
// environmental state. This module exposes ONLY signals that are currently REAL in the
// simulation — season, the current climate-stress snapshot, tile terrain/risk profile,
// and the band's own lived fire/fuel state. It does NOT implement climate: the next
// checkpoint (CLIMATE / WEATHER / REGIONAL SEASONALITY FOUNDATION-1) will replace and
// extend these inputs with the canonical climate/weather authority; every consumer of
// this boundary is a ready seam for that work. Nothing here feeds food or yield.
import type { TileId } from "../core/types";
import type { Tile, WorldState } from "../world/types";
import type { Band } from "./types";

export interface EnvironmentalVisibility {
  /** 0..1 — how far/clearly anything can be seen today (1 = clear). */
  readonly visibilityFactor: number;
  readonly basis: string;
}

/**
 * Present visibility conditions at a tile, from currently real state only:
 * season (winter light/weather, summer haze over dry country) and the active
 * climate-stress snapshot. Deterministic; no hidden per-day weather exists yet.
 */
export function deriveEnvironmentalVisibility(world: WorldState, tileId: TileId): EnvironmentalVisibility {
  const tile = world.tiles[tileId];
  const season = world.time.season;
  let factor = 1;
  const basis: string[] = [`season:${season}`];

  if (season === "winter") {
    factor -= 0.2;
  } else if (season === "autumn") {
    factor -= 0.08;
  }

  if (tile !== undefined && season === "summer" && tile.riskProfile.droughtRisk > 0.6) {
    factor -= 0.12;
    basis.push("dry-season haze");
  }

  const stress = world.currentClimateStress;

  if (stress !== null && stress.severity > 0.4) {
    factor -= Math.min(0.25, stress.severity * 0.3);
    basis.push(`climate-stress:${stress.label}`);
  }

  return { visibilityFactor: Math.max(0.3, Math.round(factor * 100) / 100), basis: basis.join("; ") };
}

export interface FireFeasibility {
  readonly feasible: boolean;
  /** 0..1 — how strong/visible a fire's smoke column can physically be here today. */
  readonly strength: number;
  readonly basis: string;
}

/**
 * Can a party physically raise a smoke fire at this tile today? Requires burnable
 * country (present terrain), tolerable wetness (present season + tile risk), and the
 * band's own lived fuel/fire competence (`bodyCampLogistics.fire` — an existing
 * authority, not a new system).
 */
export function deriveFireFeasibility(world: WorldState, band: Band, tileId: TileId): FireFeasibility {
  const tile = world.tiles[tileId];

  if (tile === undefined || tile.isAquatic === true) {
    return { feasible: false, strength: 0, basis: "no dry ground" };
  }

  const fuelFromTerrain = terrainFuel(tile);

  if (fuelFromTerrain <= 0.05) {
    return { feasible: false, strength: 0, basis: `no fuel (${tile.terrainKind})` };
  }

  const wetPenalty =
    world.time.season === "winter" ? 0.25 : tile.riskProfile.floodRisk > 0.6 ? 0.2 : 0;
  // The band's own lived fire state: a band that keeps fire going at camp knows how
  // to raise one in the field; fuel pressure and risk it has experienced still bind.
  const fire = band.bodyCampLogistics?.fire;
  const competence =
    fire === undefined || fire.status === "not_relevant"
      ? 0.5
      : Math.max(0.2, Math.min(1, 0.4 + fire.fuelBasis * 0.4 + fire.usefulness * 0.2 - fire.fuelPressure * 0.2));
  const strength = Math.max(0, Math.min(1, fuelFromTerrain * competence - wetPenalty));

  return {
    feasible: strength > 0.12,
    strength: Math.round(strength * 100) / 100,
    basis: `terrain:${tile.terrainKind}; season:${world.time.season}; lived fire state`,
  };
}

function terrainFuel(tile: Tile): number {
  switch (tile.terrainKind) {
    case "forest":
      return 1;
    case "hills":
    case "river_valley":
      return 0.7;
    case "plains":
      return 0.6;
    case "coast":
      return 0.45;
    case "wetlands":
      return 0.35;
    case "mountains":
      return 0.25;
    case "desert":
    case "tundra":
      return 0.2;
    case "lake":
      return 0;
  }
}
