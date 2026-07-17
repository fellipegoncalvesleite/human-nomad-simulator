// EXPEDITIONARY-4 §13 — physical fire/smoke signaling.
//
// A smoke signal is a PHYSICAL event: an away party standing at a real tile raises a
// real fire (present fuel, wetness, and its own lived fire competence decide whether
// it can), and the residential camp either sees the column or does not (distance,
// terrain occlusion, present visibility). A deliberate meaning is understood ONLY
// when the convention was planned before departure — anyone else, and any unplanned
// smoke, reads as ambiguous "someone's fire" at best.
//
// Signals transfer a BOUNDED meaning, never the party's observation ledger, and
// never reveal a source's identity/population/task to a stranger. All records are
// capped and expire.
import type { DayNumber, TileId } from "../core/types";
import { getTileAtCoord } from "../world/generate";
import type { WorldState } from "../world/types";
import { deriveEnvironmentalVisibility, deriveFireFeasibility } from "./environmentBoundary";
import type {
  Band,
  ExpeditionSignalAttempt,
  LandscapeVisibilityDirection,
  ReceivedSmokeSignal,
  SmokeSignalMeaning,
  SmokeSignalOutcome,
} from "./types";

/** Beyond this many tiles no smoke column reads at all (bounded perception). */
export const SMOKE_MAX_VISIBLE_TILES = 14;
/** Bounded per-party attempts and per-band received records. */
export const SIGNAL_ATTEMPT_CAP = 2;
export const RECEIVED_SIGNAL_CAP = 6;
/** A received signal stops meaning anything after this many days. */
export const RECEIVED_SIGNAL_TTL_DAYS = 12;

export interface SmokeDetectionInput {
  readonly distanceTiles: number;
  readonly occluded: boolean;
  /** Present environmental visibility at the RECEIVER (0..1). */
  readonly visibilityFactor: number;
  /** Physical smoke strength at the SOURCE (0..1; 0 = no fire possible). */
  readonly strength: number;
  /** Was the signal convention planned with the receiver before departure? */
  readonly planned: boolean;
}

/**
 * Pure, deterministic detection physics. Every §13.4 outcome is reachable:
 * infeasible fire → not_feasible; beyond range → too_distant; terrain in the way →
 * occluded; poor visibility → visibility_suppressed; weak column at long range →
 * missed; seen without a planned convention → seen_ambiguous; planned and seen →
 * seen_understood.
 */
export function classifySmokeDetection(input: SmokeDetectionInput): SmokeSignalOutcome {
  if (input.strength <= 0.12) {
    return "not_feasible";
  }

  if (input.distanceTiles > SMOKE_MAX_VISIBLE_TILES) {
    return "too_distant";
  }

  if (input.occluded) {
    return "occluded";
  }

  if (input.visibilityFactor < 0.5) {
    return "visibility_suppressed";
  }

  // Legibility falls with distance and rises with column strength and clear air.
  const legibility =
    input.strength * 0.55 +
    input.visibilityFactor * 0.3 +
    (1 - input.distanceTiles / SMOKE_MAX_VISIBLE_TILES) * 0.35;

  if (legibility < 0.55) {
    return "missed";
  }

  return input.planned ? "seen_understood" : "seen_ambiguous";
}

/** §12.2-style terrain occlusion between two tiles (mountain wall along the line). */
export function isSmokeLineOccluded(world: WorldState, fromTileId: TileId, toTileId: TileId): boolean {
  const from = world.tiles[fromTileId];
  const to = world.tiles[toTileId];

  if (from === undefined || to === undefined) {
    return true;
  }

  const dx = to.coord.x - from.coord.x;
  const dy = to.coord.y - from.coord.y;
  const steps = Math.max(Math.abs(dx), Math.abs(dy));

  if (steps <= 2) {
    return false;
  }

  // Smoke rises: the sight ceiling is higher than for ground cues, so only a real
  // mountain wall between source and receiver blocks the column.
  const sightCeiling = Math.max(from.elevation, to.elevation) + 0.24;

  for (let step = 1; step < steps; step += 1) {
    const sample = getTileAtCoord(world, {
      x: Math.round(from.coord.x + (dx * step) / steps),
      y: Math.round(from.coord.y + (dy * step) / steps),
    });

    if (sample !== undefined && sample.elevation > sightCeiling && sample.terrainKind === "mountains") {
      return true;
    }
  }

  return false;
}

export interface ResolvedSmokeSignal {
  readonly attempt: ExpeditionSignalAttempt;
  /** Present only when the residential camp physically received something. */
  readonly received?: ReceivedSmokeSignal;
}

/**
 * Resolve ONE deliberate same-band signal attempt from a party at `sourceTileId`
 * toward its own residential camp. The attempt consumes the party's work/labor
 * for the moment it is made (the caller charges that); this resolves only the
 * physics. Deterministic.
 */
export function resolveSmokeSignal(params: {
  readonly world: WorldState;
  readonly band: Band;
  readonly expeditionId: string;
  readonly sourceTileId: TileId;
  readonly meaning: SmokeSignalMeaning;
  readonly planned: boolean;
  readonly aboutTileId?: TileId;
  readonly day: DayNumber;
}): ResolvedSmokeSignal {
  const { world, band, expeditionId, sourceTileId, meaning, planned, aboutTileId, day } = params;
  const fire = deriveFireFeasibility(world, band, sourceTileId);
  const receiverVisibility = deriveEnvironmentalVisibility(world, band.position);
  const source = world.tiles[sourceTileId];
  const camp = world.tiles[band.position];
  const distanceTiles =
    source === undefined || camp === undefined
      ? Number.POSITIVE_INFINITY
      : Math.max(Math.abs(source.coord.x - camp.coord.x), Math.abs(source.coord.y - camp.coord.y));
  const occluded = isSmokeLineOccluded(world, sourceTileId, band.position);
  const outcome = classifySmokeDetection({
    distanceTiles,
    occluded,
    visibilityFactor: receiverVisibility.visibilityFactor,
    strength: fire.strength,
    planned,
  });
  const attempt: ExpeditionSignalAttempt = {
    id: `signal:${expeditionId}:${Number(day)}:${meaning}`,
    day,
    tileId: sourceTileId,
    meaning,
    planned,
    strength: fire.strength,
    outcome,
  };

  if (outcome !== "seen_understood" && outcome !== "seen_ambiguous") {
    return { attempt };
  }

  const received: ReceivedSmokeSignal = {
    id: attempt.id,
    day,
    tick: world.time.tick,
    direction: directionBetween(world, band.position, sourceTileId),
    distanceBand: distanceTiles <= 4 ? "near" : distanceTiles <= 9 ? "middle" : "far",
    outcome,
    // The meaning crosses ONLY when the planned convention was understood.
    ...(outcome === "seen_understood" ? { meaning } : {}),
    ...(outcome === "seen_understood" && aboutTileId !== undefined ? { aboutTileId } : {}),
    expiresOnDay: (Number(day) + RECEIVED_SIGNAL_TTL_DAYS) as DayNumber,
  };
  return { attempt, received };
}

/** Append a received signal to the band's bounded, expiring record. */
export function appendReceivedSignal(
  band: Band,
  received: ReceivedSmokeSignal,
  day: DayNumber,
): readonly ReceivedSmokeSignal[] {
  return [received, ...pruneExpiredSignals(band.receivedSmokeSignals, day)].slice(0, RECEIVED_SIGNAL_CAP);
}

export function pruneExpiredSignals(
  signals: readonly ReceivedSmokeSignal[] | undefined,
  day: DayNumber,
): readonly ReceivedSmokeSignal[] {
  return (signals ?? []).filter((signal) => Number(signal.expiresOnDay) >= Number(day));
}

/** An understood, unexpired signal carrying this meaning about this tile, if any. */
export function findUnderstoodSignal(
  band: Band,
  meaning: SmokeSignalMeaning,
  aboutTileId: TileId,
  day: DayNumber,
): ReceivedSmokeSignal | undefined {
  return pruneExpiredSignals(band.receivedSmokeSignals, day).find(
    (signal) => signal.meaning === meaning && signal.aboutTileId === aboutTileId,
  );
}

function directionBetween(world: WorldState, fromTileId: TileId, toTileId: TileId): LandscapeVisibilityDirection {
  const from = world.tiles[fromTileId];
  const to = world.tiles[toTileId];

  if (from === undefined || to === undefined) {
    return "north";
  }

  const angle = Math.atan2(to.coord.y - from.coord.y, to.coord.x - from.coord.x);
  const eighth = (Math.round(angle / (Math.PI / 4)) + 8) % 8;
  const directions: readonly LandscapeVisibilityDirection[] = [
    "east", "southeast", "south", "southwest", "west", "northwest", "north", "northeast",
  ];
  return directions[eighth] ?? "east";
}
