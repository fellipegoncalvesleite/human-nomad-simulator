import type { Band } from "./types";
import type { BandId } from "../core/types";
import type { WorldState } from "../world/types";

export function isBandTerminal(band: Band): boolean {
  return band.status === "dispersed" ||
    band.viability?.status === "absorbed" ||
    band.viability?.status === "extinct";
}

export function isLivingBand(band: Band): boolean {
  return band.demography.population > 0 && !isBandTerminal(band);
}

// Behavioral context reducers are intentionally broad compositions. This final
// boundary makes terminality structural: archival bands keep their exact frozen
// behavioral snapshot while ecology/history outside the band may continue.
export function preserveTerminalBandSnapshots(
  before: WorldState,
  after: WorldState,
): WorldState {
  const terminal = Object.values(before.bands).filter(isBandTerminal);
  if (terminal.length === 0) {
    return after;
  }
  const bands = { ...after.bands } as Record<BandId, Band>;
  for (const band of terminal) {
    bands[band.id] = band;
  }
  return { ...after, bands };
}
