// RESIDENTIAL-MOVE-1 — RECORD-ONLY residential relocation events.
//
// Today a band that relocates does so as a single seasonal-boundary jump
// ("season ended, band moved"). This module turns that ALREADY-decided move into a
// legible, explanatory record: a time-span inside the season (start/end day), a
// passability-aware route, a movement kind, a cause, and an arrival status.
//
// HARD CONSTRAINTS (enforced by construction + the audit):
//   - Does NOT create or change any movement decision (it reads the decided move).
//   - Does NOT move band.position daily (band.position still changes only at the
//     boundary, in applyBandDecision; this is a retrospective annotation).
//   - Is NEVER read by yield/support/carrying-capacity/population/stress/mortality.
//   - Routes are passability-aware. A no-land-route move can only show a bounded,
//     explicitly grounded temporary-watercraft annotation; no permanent boat inventory,
//     bridges, docks, or hidden river teleport.
//   - PURE & deterministic: no unseeded random call, no `any`, no UI/render/Zustand imports.
//
// The byte-identical-baseline guarantee comes from the caller gate: when the band
// did NOT relocate this season, the prior ring is returned unchanged (see
// deriveResidentialMoveEventRing). A band that never relocates keeps it undefined.

import { SEASON_LENGTH_DAYS } from "../core/types";
import type {
  BandId,
  DayNumber,
  EventId,
  ReasonId,
  Season,
  TickNumber,
  TileId,
} from "../core/types";
import type { Decision } from "../rules/types";
import type { WorldState } from "../world/types";
import { isBandPassableDestination } from "../world/passability";
// 2K.12: selection-only seasonal-memory reader (band-learned only; no hidden truth).
import { readSeasonalEcologyHint } from "./seasonalEcologyReader";
import { deriveTemporaryWatercraftAssessmentForMove } from "./storageSuitability";
import type {
  Band,
  ResidentialMoveCause,
  ResidentialMoveEvent,
  ResidentialMoveKind,
  ResidentialMoveStatus,
} from "./types";

const RESIDENTIAL_MOVE_EVENT_RING_CAP = 4;
// Generous but bounded — residential relocations are short and infrequent (only
// fired when the band actually moved), and pathTiles are record-only (cosmetic,
// excluded from the determinism fingerprint), so the cost never touches baselines.
const RESIDENTIAL_MOVE_PATH_MAX_EXPLORED = 1024;
const RESIDENTIAL_MOVE_PATH_MAX_TILES = 64;

export interface DeriveResidentialMoveEventArgs {
  readonly world: WorldState;
  readonly band: Band;
  readonly nextPosition: TileId;
  readonly moved: boolean;
  readonly decision: Decision;
  readonly prevRing?: readonly ResidentialMoveEvent[];
}

// THE GATE. When the residence did not move this season, the prior ring is returned
// untouched — this is what keeps a non-relocating world byte-identical. Only a real
// relocation appends one record-only event.
export function deriveResidentialMoveEventRing(
  args: DeriveResidentialMoveEventArgs,
): readonly ResidentialMoveEvent[] | undefined {
  const { world, band, nextPosition, moved, decision, prevRing } = args;

  if (!moved || nextPosition === band.position) {
    return prevRing;
  }

  const event = buildResidentialMoveEvent(world, band, nextPosition, decision);

  return [event, ...(prevRing ?? [])].slice(0, RESIDENTIAL_MOVE_EVENT_RING_CAP);
}

function buildResidentialMoveEvent(
  world: WorldState,
  band: Band,
  nextPosition: TileId,
  decision: Decision,
): ResidentialMoveEvent {
  const fromTileId = band.position;
  const route = findPassableLandPath(world, fromTileId, nextPosition);
  const cause = classifyResidentialMoveCause(band, decision);
  const moveKind = moveKindForCause(cause);
  const reasonIds = [
    decision.primaryReason.id,
    ...decision.secondaryReasons.map((reason) => reason.id),
  ].slice(0, 6) as readonly ReasonId[];
  const landStatus: ResidentialMoveStatus = route === undefined ? "failed_no_route" : "arrived";
  const landDistance =
    route === undefined ? manhattan(world, fromTileId, nextPosition) : Math.max(0, route.length - 1);
  const temporaryWatercraft = deriveTemporaryWatercraftAssessmentForMove({
    world,
    band,
    fromTileId,
    toTileId: nextPosition,
    landRouteStatus: landStatus,
    landRouteDistance: landDistance,
    storageCards: band.resourceEcology?.storageSuitabilityCards ?? [],
    reasonIds,
  });
  const watercraftArrived =
    temporaryWatercraft?.result === "crossing_success" &&
    temporaryWatercraft.crossingPathTiles.length >= 2;
  const watercraftDelayed =
    temporaryWatercraft?.result === "crossing_delayed_materials" ||
    temporaryWatercraft?.result === "crossing_partial_success";
  const status: ResidentialMoveStatus =
    route !== undefined ? "arrived" :
    watercraftArrived ? "arrived" :
    watercraftDelayed ? "delayed_placeholder" :
    "failed_no_route";
  const watercraftPathTiles = watercraftArrived && temporaryWatercraft !== undefined
    ? temporaryWatercraft.crossingPathTiles
    : undefined;
  const pathTiles =
    route ??
    watercraftPathTiles ??
    [fromTileId];
  const distanceTiles = route === undefined && watercraftArrived
    ? Math.max(1, pathTiles.length - 1)
    : landDistance;
  const startDay = startDayForKind(moveKind);
  const watercraftDelayDays = temporaryWatercraft === undefined
    ? 0
    : Math.min(4, Math.max(0, temporaryWatercraft.shuttleTrips - 1));
  const durationDays = Math.max(1, Math.min(14, distanceTiles + watercraftDelayDays));
  const endDay = Math.min(SEASON_LENGTH_DAYS - 1, startDay + durationDays);
  const hardship = deriveMigrationHardship(world, band, distanceTiles, status, temporaryWatercraft);

  // 2K.12: record-only learned-seasonal CONTEXT about the destination (not a cause — the
  // move scorer is not biased by seasonal memory in 2K.12). Flag default OFF / no relevant
  // learned memory → undefined → byte-identical event.
  const seasonalMemoryContext =
    world.auditOptions?.seasonalEcologyMemoryReadersEnabled === true
      ? deriveSeasonalMoveContext(band, nextPosition, world.time.season)
      : undefined;

  return {
    eventId: `move:${String(band.id)}:${Number(world.time.tick)}:${String(fromTileId)}->${String(nextPosition)}` as EventId,
    bandId: band.id as BandId,
    tick: world.time.tick as TickNumber,
    season: world.time.season as Season,
    startDay: startDay as DayNumber,
    endDay: endDay as DayNumber,
    durationDays: endDay - startDay,
    fromTileId,
    toTileId: nextPosition,
    pathTiles,
    distanceTiles,
    moveKind,
    cause,
    status,
    confidence: clamp01(band.pressureState?.confidence ?? 0.5),
    reasonIds,
    hardshipRisk: hardship.risk,
    hardshipLevel: hardship.level,
    hardshipReason: hardship.reason,
    hardshipOutcome: hardship.outcome,
    hardshipCautionModifier: hardship.cautionModifier,
    ...(temporaryWatercraft !== undefined ? { temporaryWatercraft } : {}),
    ...(seasonalMemoryContext !== undefined ? { seasonalMemoryContext } : {}),
    noDailyPositionMutation: true,
    noYieldChange: true,
    noSupportChange: true,
    noPopulationChange: true,
    noStressChange: true,
  };
}

function deriveMigrationHardship(
  world: WorldState,
  band: Band,
  distanceTiles: number,
  status: ResidentialMoveStatus,
  temporaryWatercraft: ReturnType<typeof deriveTemporaryWatercraftAssessmentForMove>,
): {
  readonly risk: number;
  readonly level: "low" | "moderate" | "high" | "severe";
  readonly reason: string;
  readonly outcome: "accepted" | "delayed" | "diverted" | "rejected" | "risk_only";
  readonly cautionModifier: number;
} {
  const population = Math.max(1, band.demography.population);
  const dependentShare = band.demography.dependents / population;
  const elderShare = band.demography.elders / population;
  const foodStress = band.pressureState?.foodStress ?? 0;
  const waterStress = band.pressureState?.waterStress ?? 0;
  const fatigue = band.pressureState?.fatiguePressure ?? 0;
  const seasonalHardship =
    world.time.season === "summer"
      ? 0.12
      : world.time.season === "winter"
        ? 0.08
        : 0;
  const risk = round2(clamp01(
    distanceTiles / 14 * 0.24 +
      dependentShare * 0.18 +
      elderShare * 0.16 +
      foodStress * 0.18 +
      waterStress * 0.22 +
      fatigue * 0.12 +
      seasonalHardship +
      (temporaryWatercraft === undefined ? 0 : temporaryWatercraft.riverRisk * 0.16 + temporaryWatercraft.seasonExposureRisk * 0.12),
  ));
  const level =
    risk >= 0.72 ? "severe" :
    risk >= 0.5 ? "high" :
    risk >= 0.28 ? "moderate" :
    "low";
  const reason =
    temporaryWatercraft?.result === "crossing_success" ? `temporary ${temporaryWatercraft.optionLabel ?? "watercraft"} crossing: ${temporaryWatercraft.shuttleTrips} shuttle trips` :
    temporaryWatercraft?.result === "crossing_delayed_materials" ? "river crossing delayed: materials, labor, or carried load were too costly" :
    temporaryWatercraft?.result === "crossing_partial_success" ? "river crossing partly prepared, but dependents and carrying burden slowed the move" :
    temporaryWatercraft?.result === "materials_missing" ? "route rejected: no passable land route and no known temporary crossing material" :
    temporaryWatercraft?.result === "crossing_abandoned_risk" ? "route rejected: river/current/season made a whole-band crossing too risky" :
    status === "failed_no_route" ? "route rejected: no passable land route" :
    waterStress >= 0.55 ? "hard move: water stress and water gap risk" :
    dependentShare + elderShare >= 0.55 ? "hard move: dependents/elders slow the group" :
    foodStress >= 0.5 ? "hard move: food stress before departure" :
    distanceTiles >= 6 ? "hard move: long residential route" :
    "move hardship low";
  const outcome =
    temporaryWatercraft?.result === "crossing_success" ? "accepted" :
    temporaryWatercraft?.result === "crossing_delayed_materials" || temporaryWatercraft?.result === "crossing_partial_success" ? "delayed" :
    temporaryWatercraft?.result === "materials_missing" || temporaryWatercraft?.result === "crossing_abandoned_risk" ? "rejected" :
    status === "failed_no_route" ? "rejected" :
    level === "severe" ? "risk_only" :
    level === "high" ? "accepted" :
    "accepted";

  return {
    risk,
    level,
    reason,
    outcome,
    cautionModifier: round2(risk * 0.4),
  };
}

// 2K.12: record-only learned-seasonal context about the destination tile. Reads ONLY the
// band's own seasonalEcologyMemory (no hidden truth); returns undefined when nothing is
// remembered. Used purely for legible annotation — never a movement cause or economy input.
function deriveSeasonalMoveContext(
  band: Band,
  tileId: TileId,
  season: Season,
): readonly string[] | undefined {
  const hint = readSeasonalEcologyHint(band.seasonalEcologyMemory, tileId, season);
  if (hint === undefined) {
    return undefined;
  }
  return [`${hint.kind} (bias ${hint.bias}): ${hint.basis}`];
}

// Cause is derived from the FROM band's pre-decision pressure (what drove the move)
// plus the decided mobility intent. Deterministic priority; never truth-based.
function classifyResidentialMoveCause(band: Band, decision: Decision): ResidentialMoveCause {
  const pressure = band.pressureState;
  const intentKind = decision.mobilityIntent?.kind;
  const water = pressure?.waterStress ?? 0;
  const crowding = Math.max(
    pressure?.nearbyBandPressure ?? 0,
    pressure?.crowdingPenalty ?? 0,
    pressure?.daughterDispersalPressure ?? 0,
  );
  const food = pressure?.foodStress ?? 0;
  const isFrontierIntent =
    intentKind === "follow_river_corridor" ||
    intentKind === "probe_coast" ||
    intentKind === "probe_wetland_or_lake" ||
    intentKind === "cross_pass" ||
    intentKind === "expand_known_world" ||
    intentKind === "seek_new_range" ||
    intentKind === "frontier_dispersal" ||
    intentKind === "daughter_range_expansion";

  if (intentKind === "seek_better_water" || water >= 0.5) {
    return "water_stress";
  }

  if (crowding >= 0.5) {
    return "local_pressure";
  }

  if (food >= 0.5) {
    return "poor_return";
  }

  if (isFrontierIntent) {
    return "frontier_intent";
  }

  if (intentKind === "return_to_known_good_area") {
    return "known_opportunity";
  }

  return "unknown";
}

function moveKindForCause(cause: ResidentialMoveCause): ResidentialMoveKind {
  switch (cause) {
    case "water_stress":
      return "emergency_water_move";
    case "poor_return":
      return "food_pressure_move";
    case "local_pressure":
      return "crowding_pressure_move";
    case "frontier_intent":
      return "frontier_probe_residential_shift";
    case "known_opportunity":
      return "residential_relocation";
    case "fission_daughter":
      return "daughter_colonization_move";
    case "seasonal_refuge_future":
      return "seasonal_strategy_future";
    default:
      return "residential_relocation";
  }
}

// Deterministic plausible start day within the season, per the spec's timing guidance:
// emergencies start early, pressure moves mid-season, planned/known-opportunity later.
function startDayForKind(kind: ResidentialMoveKind): number {
  switch (kind) {
    case "emergency_water_move":
      return 3;
    case "crowding_pressure_move":
      return 24;
    case "food_pressure_move":
      return 30;
    case "frontier_probe_residential_shift":
      return 45;
    case "daughter_colonization_move":
      return 6;
    case "seasonal_strategy_future":
      return 60;
    default:
      return 18;
  }
}

// Deterministic BFS over 4-adjacent PASSABLE land (sorted neighbours for a stable
// tie-break). Returns the inclusive origin→target path, or undefined if the target
// is not reachable on land (recorded as failed_no_route — never a fake water crossing).
function findPassableLandPath(
  world: WorldState,
  originTileId: TileId,
  targetTileId: TileId,
): readonly TileId[] | undefined {
  if (originTileId === targetTileId) {
    return [originTileId];
  }

  const targetTile = world.tiles[targetTileId];

  if (targetTile === undefined || !isBandPassableDestination(targetTile)) {
    return undefined;
  }

  const cameFrom = new Map<TileId, TileId>();
  const visited = new Set<TileId>([originTileId]);
  let frontier: TileId[] = [originTileId];
  let explored = 0;

  while (frontier.length > 0 && explored < RESIDENTIAL_MOVE_PATH_MAX_EXPLORED) {
    const next: TileId[] = [];

    for (const tileId of frontier) {
      explored += 1;

      const tile = world.tiles[tileId];

      if (tile === undefined) {
        continue;
      }

      const neighbors = [...tile.neighbors].sort((left, right) => String(left).localeCompare(String(right)));

      for (const neighborId of neighbors) {
        if (visited.has(neighborId)) {
          continue;
        }

        const neighbor = world.tiles[neighborId];

        if (neighbor === undefined || !isBandPassableDestination(neighbor)) {
          continue;
        }

        visited.add(neighborId);
        cameFrom.set(neighborId, tileId);

        if (neighborId === targetTileId) {
          return reconstructPath(cameFrom, originTileId, targetTileId);
        }

        next.push(neighborId);
      }
    }

    frontier = next;
  }

  return undefined;
}

function reconstructPath(
  cameFrom: Map<TileId, TileId>,
  originTileId: TileId,
  targetTileId: TileId,
): readonly TileId[] {
  const reversed: TileId[] = [targetTileId];
  let current = targetTileId;

  while (current !== originTileId && reversed.length < RESIDENTIAL_MOVE_PATH_MAX_TILES) {
    const previous = cameFrom.get(current);

    if (previous === undefined) {
      break;
    }

    reversed.push(previous);
    current = previous;
  }

  return reversed.reverse();
}

function manhattan(world: WorldState, fromTileId: TileId, toTileId: TileId): number {
  const from = world.tiles[fromTileId];
  const to = world.tiles[toTileId];

  if (from === undefined || to === undefined) {
    return 0;
  }

  return Math.abs(from.coord.x - to.coord.x) + Math.abs(from.coord.y - to.coord.y);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
