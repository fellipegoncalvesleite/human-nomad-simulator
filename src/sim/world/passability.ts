import type { Tile } from "./types";

export function isBandPassableDestination(tile: Tile): boolean {
  return !tile.isAquatic;
}
